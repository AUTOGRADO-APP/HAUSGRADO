-- =====================================================================
-- Perfis de acesso (pedido do Vinícius em 2026-10-19)
--   Master        tudo.
--   Administrador tudo, menos Configurações e excluir O.S., orçamentos e clientes.
--   Atendente     sem Gestão, Despesas, Comissões, Calendário financeiro e Metas
--                 (passa a ver Entradas, Compras e Fornecedores).
--   Mecânico      (novo) como o Atendente, mas sem nada do Financeiro (nem receber pagamento),
--                 sem Orçamentos e sem Clientes. Vê o nome do cliente na O.S. e cadastra cliente na Nova O.S.
--
-- Exclusão de O.S., orçamentos e clientes: só o MASTER.
--   Excluir uma O.S. leva junto tudo o que só existe por ela: orçamento(s) e itens, fotos, registros,
--   histórico e, se estava finalizada, o recebimento (entrada, formas, taxas), a comissão paga e a
--   baixa de estoque (as peças voltam ao estoque). O master pode excluir até O.S. finalizada.
--   Excluir um cliente leva junto as O.S. dele, os orçamentos e os agendamentos.
--   Os veículos ficam cadastrados, sem dono. Os arquivos do Storage são apagados pela tela.
-- =====================================================================

-- ---------- 0. perfil Mecânico e is_office() ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('master','admin','atendente','mecanico'));

-- "escritório" = todos menos o mecânico (orçamentos, clientes, recebimento, entradas, compras, fornecedores)
create or replace function public.is_office() returns boolean
language sql stable set search_path = public as $$ select coalesce(public.current_app_role() in ('master','admin','atendente'), false) $$;
revoke execute on function public.is_office() from public, anon;
grant execute on function public.is_office() to authenticated, service_role;

-- orçamentos e itens: só escritório (leitura e escrita)
do $$
declare t text;
begin
  foreach t in array array['quotes','quote_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format('create policy %I on public.%I for select to authenticated using (shop_id = public.current_shop_id() and public.is_office())', t || '_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (shop_id = public.current_shop_id() and public.is_office())', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (shop_id = public.current_shop_id() and public.is_office()) with check (shop_id = public.current_shop_id() and public.is_office())', t || '_upd', t);
  end loop;
end $$;
drop policy if exists quote_items_del on public.quote_items;
create policy quote_items_del on public.quote_items for delete to authenticated
  using (shop_id = public.current_shop_id() and public.is_office());

-- funções SECURITY DEFINER (desconto etc.) passam por cima da RLS: o mecânico também é barrado aqui
create or replace function public.tg_quotes_office() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_office() then
    raise exception 'Seu perfil não tem acesso a orçamentos.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists quotes_office on public.quotes;
create trigger quotes_office before insert or update or delete on public.quotes
  for each row execute function public.tg_quotes_office();
drop trigger if exists quote_items_office on public.quote_items;
create trigger quote_items_office before insert or update or delete on public.quote_items
  for each row execute function public.tg_quotes_office();

-- clientes: o mecânico lê e cadastra (Nova O.S.), mas não edita
drop policy if exists customers_upd on public.customers;
create policy customers_upd on public.customers for update to authenticated
  using (shop_id = public.current_shop_id() and public.is_office()) with check (shop_id = public.current_shop_id() and public.is_office());

-- recebimentos: leitura para o escritório (Entradas); gravação só por register_receipt(), que o mecânico não usa
drop policy if exists receipts_sel on public.receipts;
create policy receipts_sel on public.receipts for select to authenticated using (shop_id = public.current_shop_id() and public.is_office());
drop policy if exists receipt_payments_sel on public.receipt_payments;
create policy receipt_payments_sel on public.receipt_payments for select to authenticated using (shop_id = public.current_shop_id() and public.is_office());
create or replace function public.tg_receipts_office() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_office() then
    raise exception 'Seu perfil não pode receber pagamento nem finalizar O.S.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists receipts_office on public.receipts;
create trigger receipts_office before insert on public.receipts
  for each row execute function public.tg_receipts_office();

-- compras e fornecedores: escritório (despesas, comissões e metas continuam só master/admin)
do $$
declare t text;
begin
  foreach t in array array['suppliers','purchases','purchase_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_fin', t);
    execute format('create policy %I on public.%I for all to authenticated using (shop_id = public.current_shop_id() and public.is_office()) with check (shop_id = public.current_shop_id() and public.is_office())', t || '_office', t);
  end loop;
end $$;

-- ---------- 1. exclusão: só master ----------
drop policy if exists service_orders_del on public.service_orders;
create policy service_orders_del on public.service_orders for delete to authenticated
  using (shop_id = public.current_shop_id() and public.is_master());
drop policy if exists quotes_del on public.quotes;
create policy quotes_del on public.quotes for delete to authenticated
  using (shop_id = public.current_shop_id() and public.is_master());
drop policy if exists customers_del on public.customers;
create policy customers_del on public.customers for delete to authenticated
  using (shop_id = public.current_shop_id() and public.is_master());

-- ---------- 2. O.S.: o orçamento sai junto (antes ficava solto, sem O.S.) ----------
alter table public.quotes drop constraint if exists quotes_service_order_id_fkey;
alter table public.quotes add constraint quotes_service_order_id_fkey
  foreign key (service_order_id) references public.service_orders(id) on delete cascade;

-- O.S. finalizada agora pode ser excluída, mas só pelo master (a RLS já barra os outros perfis;
-- isto cobre funções SECURITY DEFINER). Sem usuário logado (SQL Editor, scripts) continua liberado.
create or replace function public.tg_os_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_master() then
    raise exception 'Só o usuário master pode excluir O.S.' using errcode = '42501';
  end if;
  return old;
end $$;

-- agendamento que virou O.S. de outro cliente não pode travar a exclusão
alter table public.service_orders drop constraint if exists service_orders_appointment_id_fkey;
alter table public.service_orders add constraint service_orders_appointment_id_fkey
  foreign key (appointment_id) references public.appointments(id) on delete set null;

-- ---------- 3. cliente: apaga O.S., orçamentos e agendamentos dele ----------
-- SECURITY INVOKER de propósito: cada delete passa pela RLS de quem excluiu (só o master consegue).
create or replace function public.tg_customer_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_master() then
    raise exception 'Só o usuário master pode excluir clientes.' using errcode = '42501';
  end if;
  delete from public.service_orders where customer_id = old.id;   -- leva os orçamentos ligados (item 2)
  delete from public.quotes where customer_id = old.id;           -- orçamentos avulsos
  delete from public.appointments where customer_id = old.id;
  return old;
end $$;
drop trigger if exists customers_delete on public.customers;
create trigger customers_delete before delete on public.customers
  for each row execute function public.tg_customer_delete();
