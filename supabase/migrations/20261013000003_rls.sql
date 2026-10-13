-- =====================================================================
-- Hausgrado · regras de acesso (Row Level Security)
-- Princípio: cada usuário só enxerga a própria oficina (shop_id = current_shop_id()).
-- Financeiro (recebimentos, compras, despesas, fornecedores, comissões) = só master/admin.
-- Configurações (oficina, equipe, usuários) = só master.
-- =====================================================================

-- Liga RLS em todas as tabelas do schema public
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- tabelas de uso geral (todos os perfis da oficina) ----------
do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','appointments','service_orders','service_order_photos',
                           'service_order_records','products','service_catalog','quotes','quote_items'] loop
    execute format('create policy %I on public.%I for select to authenticated using (shop_id = public.current_shop_id())', t || '_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (shop_id = public.current_shop_id())', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id())', t || '_upd', t);
  end loop;
end $$;

-- Exclusões: itens de orçamento, fotos, registros e agenda podem ser apagados por qualquer perfil;
-- O.S., clientes, veículos, orçamentos e catálogos só por master/admin.
create policy quote_items_del on public.quote_items for delete to authenticated using (shop_id = public.current_shop_id());
create policy service_order_photos_del on public.service_order_photos for delete to authenticated using (shop_id = public.current_shop_id());
create policy service_order_records_del on public.service_order_records for delete to authenticated using (shop_id = public.current_shop_id());
create policy appointments_del on public.appointments for delete to authenticated using (shop_id = public.current_shop_id());
create policy service_orders_del on public.service_orders for delete to authenticated using (shop_id = public.current_shop_id() and public.is_fin());
create policy customers_del on public.customers for delete to authenticated using (shop_id = public.current_shop_id() and public.is_fin());
create policy vehicles_del on public.vehicles for delete to authenticated using (shop_id = public.current_shop_id() and public.is_fin());
create policy quotes_del on public.quotes for delete to authenticated using (shop_id = public.current_shop_id() and public.is_fin());
create policy products_del on public.products for delete to authenticated using (shop_id = public.current_shop_id() and public.is_fin());
create policy service_catalog_del on public.service_catalog for delete to authenticated using (shop_id = public.current_shop_id() and public.is_fin());

-- Histórico: leitura e inclusão; nunca editar/apagar (trilha de auditoria)
create policy service_order_history_sel on public.service_order_history for select to authenticated using (shop_id = public.current_shop_id());
create policy service_order_history_ins on public.service_order_history for insert to authenticated with check (shop_id = public.current_shop_id());

-- ---------- financeiro: só master/admin ----------
do $$
declare t text;
begin
  foreach t in array array['suppliers','purchases','purchase_items','expenses','commission_payments'] loop
    execute format('create policy %I on public.%I for all to authenticated using (shop_id = public.current_shop_id() and public.is_fin()) with check (shop_id = public.current_shop_id() and public.is_fin())', t || '_fin', t);
  end loop;
end $$;

-- Recebimentos: leitura master/admin; gravação só pela função register_receipt()
create policy receipts_sel on public.receipts for select to authenticated using (shop_id = public.current_shop_id() and public.is_fin());
create policy receipt_payments_sel on public.receipt_payments for select to authenticated using (shop_id = public.current_shop_id() and public.is_fin());

-- O atendente precisa saber se a O.S. está paga (sem ver valores): função própria
create or replace function public.os_is_paid(p_os uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.receipts where service_order_id = p_os and shop_id = public.current_shop_id())
$$;

-- ---------- oficina, equipe e usuários ----------
create policy shops_sel on public.shops for select to authenticated using (id = public.current_shop_id());
create policy shops_upd on public.shops for update to authenticated using (id = public.current_shop_id() and public.is_master()) with check (id = public.current_shop_id());

create policy technicians_sel on public.technicians for select to authenticated using (shop_id = public.current_shop_id());
create policy technicians_all on public.technicians for all to authenticated using (shop_id = public.current_shop_id() and public.is_master()) with check (shop_id = public.current_shop_id() and public.is_master());

create policy profiles_sel on public.profiles for select to authenticated using (shop_id = public.current_shop_id() or id = auth.uid());
create policy profiles_upd on public.profiles for update to authenticated using (shop_id = public.current_shop_id() and public.is_master()) with check (shop_id = public.current_shop_id());
-- (criação de usuários é feita no servidor com a service_role: scripts/create-demo-users.mjs ou rota /api/usuarios)

-- Master não pode rebaixar/desativar a si mesmo (evita oficina sem master)
create or replace function public.tg_profiles_guard() returns trigger
language plpgsql as $$
begin
  if old.id = auth.uid() and (new.role <> old.role or not new.active) then
    raise exception 'Você não pode alterar o próprio perfil ou se desativar.';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.tg_profiles_guard();

-- Cache de placas: leitura para logados; escrita só pela Edge Function (service_role)
create policy plate_cache_sel on public.plate_cache for select to authenticated using (true);

-- shop_secrets e portal_attempts: sem policies → ninguém lê pelo app (só funções security definer)

-- Visão de comissões: dado financeiro → filtra por perfil
create or replace view public.v_commissions with (security_invoker = true) as
select o.shop_id, o.id as service_order_id, o.number, o.plate, o.exited_at, o.technician_id, t.name as technician_name,
       public.os_labor_total(o.id) as labor_total,
       round(public.os_labor_total(o.id) * s.commission_pct / 100, 2) as commission,
       cp.paid_at
  from public.service_orders o
  join public.shops s on s.id = o.shop_id
  left join public.technicians t on t.id = o.technician_id
  left join public.commission_payments cp on cp.service_order_id = o.id
 where o.status = 'finalizado' and public.is_fin();
revoke all on public.v_commissions from anon;

-- Funções: por padrão o Postgres libera EXECUTE para PUBLIC. Fechamos e liberamos só para logados.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.check_discount_password(uuid, text) from authenticated;
revoke execute on function public.portal_get(text, text) from authenticated;
revoke execute on function public.portal_decide_quote(text, text, text) from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
grant execute on function public.portal_get(text, text) to service_role;
grant execute on function public.portal_decide_quote(text, text, text) to service_role;
