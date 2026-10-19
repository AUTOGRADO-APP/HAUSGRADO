-- =====================================================================
-- Hausgrado · "Serviços a executar" na O.S. (pedido do Vinícius em 2026-10-19)
--   Todos os perfis (inclusive o Mecânico, que não lê orçamentos) veem os itens do orçamento
--   ativo da O.S. SEM preços, pela função os_tasks(), e marcam cada item como feito por
--   set_task_done(). Só dá para marcar com o orçamento aprovado e a O.S. não finalizada.
--   A marcação fica em quote_item_done (1 linha por item feito) e vai para o histórico da O.S.
--   Os itens do orçamento não mudam: preço, quantidade e as travas de orçamento continuam iguais.
-- =====================================================================

create table public.quote_item_done (
  quote_item_id     uuid primary key references public.quote_items(id) on delete cascade,
  shop_id           uuid not null references public.shops(id),
  service_order_id  uuid not null references public.service_orders(id) on delete cascade,
  done_at           timestamptz not null default now(),
  done_by           uuid default auth.uid(),
  done_by_name      text default public.current_user_name()
);
create index on public.quote_item_done (service_order_id);

alter table public.quote_item_done enable row level security;
-- leitura para toda a oficina; gravação só por set_task_done()
create policy quote_item_done_sel on public.quote_item_done for select to authenticated
  using (shop_id = public.current_shop_id());

-- itens do orçamento ativo da O.S., sem valores
create or replace function public.os_tasks(p_os uuid)
returns table (id uuid, kind text, description text, details text, qty numeric, "position" integer,
               quote_status text, done_at timestamptz, done_by_name text)
language sql stable security definer set search_path = public as $$
  select i.id, i.kind, i.description, i.details, i.qty, i.position, q.status, d.done_at, d.done_by_name
    from public.service_orders o
    join public.quotes q on q.id = public.os_quote(o.id)
    join public.quote_items i on i.quote_id = q.id
    left join public.quote_item_done d on d.quote_item_id = i.id
   where o.id = p_os and o.shop_id = public.current_shop_id()
     and (i.description <> '' or i.details is not null)
   order by (i.kind = 'mao'), i.position, i.created_at
$$;

create or replace function public.set_task_done(p_item uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select i.id, i.kind, i.description, q.status as q_status, o.id as os_id, o.shop_id, o.status as os_status
    into v
    from public.quote_items i
    join public.quotes q on q.id = i.quote_id
    join public.service_orders o on o.id = q.service_order_id
   where i.id = p_item and o.shop_id = public.current_shop_id() and public.os_quote(o.id) = q.id;
  if not found then
    raise exception 'Item não encontrado no orçamento desta O.S.' using errcode = 'P0002';
  end if;
  if v.os_status = 'finalizado' then
    raise exception 'A O.S. já foi finalizada: os itens não podem mais ser marcados.' using errcode = 'P0001';
  end if;
  if v.q_status <> 'aprovado' then
    raise exception 'O orçamento ainda não foi aprovado pelo cliente.' using errcode = 'P0001';
  end if;

  if p_done then
    insert into public.quote_item_done (quote_item_id, shop_id, service_order_id)
    values (v.id, v.shop_id, v.os_id) on conflict (quote_item_id) do nothing;
    if not found then return; end if;
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (v.shop_id, v.os_id, 'Feito: ' || coalesce(nullif(v.description, ''), 'item sem descrição'));
  else
    delete from public.quote_item_done where quote_item_id = v.id;
    if not found then return; end if;
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (v.shop_id, v.os_id, 'Desmarcado: ' || coalesce(nullif(v.description, ''), 'item sem descrição'));
  end if;
end $$;

-- tempo real: a O.S. aberta em outra tela vê a marcação
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quote_item_done') then
    alter publication supabase_realtime add table public.quote_item_done;
  end if;
end $$;

-- Rodar no SQL Editor do Supabase (o conector não executa revoke)
revoke execute on function public.os_tasks(uuid) from public, anon;
revoke execute on function public.set_task_done(uuid, boolean) from public, anon;
grant execute on function public.os_tasks(uuid) to authenticated;
grant execute on function public.set_task_done(uuid, boolean) to authenticated;
