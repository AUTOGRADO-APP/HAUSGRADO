-- =====================================================================
-- Hausgrado · estoque dos produtos cadastrados
--   Entra: compra RECEBIDA (data de recebimento preenchida), só itens ligados a um produto cadastrado.
--          Item avulso (sem product_id) não soma estoque nem cadastra produto.
--   Sai:   O.S. finalizada (register_receipt) baixa as peças cadastradas do orçamento que vale para a O.S.
--          (o mesmo de os_total: o mais recente não recusado). Garantia também baixa. Desfazer o recebimento devolve.
--   Ajuste manual: adjust_stock() com motivo (inventário, perda, uso interno…).
--   Estoque negativo é permitido (a tela avisa). Receber compra atualiza o custo para o último custo pago.
--   stock_qty só muda por movimentação (trigger); a trilha fica em stock_movements.
-- =====================================================================

alter table public.products
  add column stock_qty numeric(10,2) not null default 0,
  add column min_stock numeric(10,2) not null default 0 check (min_stock >= 0);

create table public.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops(id),
  product_id        uuid not null references public.products(id) on delete cascade,
  qty               numeric(10,2) not null check (qty <> 0),       -- + entrada, − saída
  kind              text not null check (kind in ('compra','os','ajuste')),
  reason            text,
  purchase_id       uuid references public.purchases(id) on delete cascade,
  service_order_id  uuid references public.service_orders(id) on delete cascade,
  occurred_at       timestamptz not null default now(),
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now()
);
create index on public.stock_movements (product_id, occurred_at desc);
create index on public.stock_movements (purchase_id);
create index on public.stock_movements (service_order_id);

alter table public.stock_movements enable row level security;
-- leitura para todos os perfis da oficina; gravação só pelas funções abaixo (security definer)
create policy stock_movements_sel on public.stock_movements for select to authenticated using (shop_id = public.current_shop_id());

-- ---------- saldo: só movimentação altera stock_qty ----------
create or replace function public.tg_products_stock_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('hausgrado.stock', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then new.stock_qty := 0;
  elsif new.stock_qty is distinct from old.stock_qty then
    raise exception 'O estoque só muda por compra, O.S. finalizada ou ajuste (adjust_stock).' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger products_stock_guard before insert or update on public.products
  for each row execute function public.tg_products_stock_guard();

create or replace function public.tg_stock_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_q numeric := case when tg_op = 'INSERT' then new.qty else -old.qty end;
        v_p uuid := coalesce(new.product_id, old.product_id);
begin
  perform set_config('hausgrado.stock', 'on', true);
  update public.products set stock_qty = stock_qty + v_q where id = v_p;
  perform set_config('hausgrado.stock', 'off', true);
  return null;
end $$;
create trigger stock_movements_apply after insert or delete on public.stock_movements
  for each row execute function public.tg_stock_apply();

create or replace function public.stock_author() returns text
language sql stable security definer set search_path = public as $$
  select full_name from public.profiles where id = auth.uid()
$$;

-- ---------- entrada pela compra recebida ----------
create or replace function public.sync_purchase_stock(p_purchase uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  delete from public.stock_movements where purchase_id = p_purchase and kind = 'compra';
  select * into v from public.purchases where id = p_purchase;
  if v.id is null then return; end if;
  if v.received_on is not null then
    insert into public.stock_movements (shop_id, product_id, qty, kind, reason, purchase_id, occurred_at, created_by, created_by_name)
    select v.shop_id, i.product_id, sum(i.qty), 'compra',
           'Compra · ' || coalesce((select name from public.suppliers where id = v.supplier_id), 'fornecedor') || coalesce(' · NF ' || v.invoice_number, ''),
           v.id, (v.received_on::timestamp + time '12:00') at time zone 'America/Sao_Paulo', auth.uid(), public.stock_author()
      from public.purchase_items i
     where i.purchase_id = v.id and i.product_id is not null
     group by i.product_id
    having sum(i.qty) <> 0;
  end if;
  -- custo do produto = último custo pago numa compra recebida (se não houver, fica o custo atual)
  update public.products p set cost = x.unit_cost
    from (select distinct on (i.product_id) i.product_id, i.unit_cost
            from public.purchase_items i join public.purchases c on c.id = i.purchase_id
           where c.received_on is not null and i.unit_cost > 0
             and i.product_id in (select product_id from public.purchase_items where purchase_id = p_purchase and product_id is not null)
           order by i.product_id, c.received_on desc, c.created_at desc, i.position desc) x
   where p.id = x.product_id and p.cost is distinct from x.unit_cost;
end $$;

create or replace function public.tg_purchase_stock_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_purchase_stock(coalesce(new.purchase_id, old.purchase_id));
  return null;
end $$;
create trigger purchase_items_stock after insert or update or delete on public.purchase_items
  for each row execute function public.tg_purchase_stock_items();

create or replace function public.tg_purchase_stock_self() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.received_on is distinct from old.received_on or new.supplier_id is distinct from old.supplier_id
     or new.invoice_number is distinct from old.invoice_number then
    perform public.sync_purchase_stock(new.id);
  end if;
  return null;
end $$;
create trigger purchases_stock after update on public.purchases
  for each row execute function public.tg_purchase_stock_self();

-- ---------- saída pela O.S. finalizada (e volta ao desfazer) ----------
create or replace function public.tg_os_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_q uuid;
begin
  if new.status = 'finalizado' and old.status is distinct from 'finalizado' then
    select q.id into v_q from public.quotes q
     where q.service_order_id = new.id and q.status <> 'recusado' order by q.created_at desc limit 1;
    if v_q is not null then
      insert into public.stock_movements (shop_id, product_id, qty, kind, reason, service_order_id, created_by, created_by_name)
      select new.shop_id, i.product_id, -sum(i.qty), 'os', 'O.S. ' || new.number || ' · ' || coalesce(new.plate, ''),
             new.id, auth.uid(), public.stock_author()
        from public.quote_items i
       where i.quote_id = v_q and i.product_id is not null
       group by i.product_id
      having sum(i.qty) <> 0;
    end if;
  elsif old.status = 'finalizado' and new.status is distinct from 'finalizado' then
    delete from public.stock_movements where service_order_id = new.id and kind = 'os';
  end if;
  return null;
end $$;
create trigger service_orders_stock after update on public.service_orders
  for each row execute function public.tg_os_stock();

-- ---------- ajuste manual ----------
-- p_qty com sinal: +3 entrada, −2 saída. Para inventário, a tela calcula (contado − saldo).
create or replace function public.adjust_stock(p_product uuid, p_qty numeric, p_reason text) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_new numeric;
begin
  select shop_id into v_shop from public.products where id = p_product;
  if v_shop is null or v_shop <> public.current_shop_id() then raise exception 'Produto não encontrado.'; end if;
  if coalesce(p_qty, 0) = 0 then raise exception 'Informe uma quantidade diferente de zero.'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Informe o motivo do ajuste.'; end if;
  insert into public.stock_movements (shop_id, product_id, qty, kind, reason, created_by, created_by_name)
  values (v_shop, p_product, round(p_qty, 2), 'ajuste', trim(p_reason), auth.uid(), public.stock_author());
  select stock_qty into v_new from public.products where id = p_product;
  return v_new;
end $$;
revoke execute on function public.adjust_stock(uuid, numeric, text) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;

-- ---------- reservado e a caminho (por produto) ----------
-- reservado = peças de orçamentos APROVADOS de O.S. ainda no pátio
-- a caminho = compras ainda não recebidas (o atendente não lê compras: por isso a função)
create or replace function public.product_stock_extra()
returns table (product_id uuid, reserved numeric, incoming numeric)
language sql stable security definer set search_path = public as $$
  with r as (
    select i.product_id, sum(i.qty) q from public.quote_items i
      join public.quotes q on q.id = i.quote_id
      join public.service_orders o on o.id = q.service_order_id
     where q.shop_id = public.current_shop_id() and q.status = 'aprovado' and o.status <> 'finalizado' and i.product_id is not null
     group by i.product_id),
  c as (
    select i.product_id, sum(i.qty) q from public.purchase_items i
      join public.purchases p on p.id = i.purchase_id
     where p.shop_id = public.current_shop_id() and p.received_on is null and i.product_id is not null
     group by i.product_id)
  select coalesce(r.product_id, c.product_id), coalesce(r.q, 0), coalesce(c.q, 0)
    from r full join c on c.product_id = r.product_id
$$;
revoke execute on function public.product_stock_extra() from public, anon;
grant execute on function public.product_stock_extra() to authenticated;

-- Saldo inicial coerente com o histórico: compras já recebidas entram e O.S. já finalizadas baixam.
-- Depois disso a oficina faz uma contagem (Ajustar estoque → Inventário) para acertar com a prateleira.
do $$
declare v uuid;
begin
  for v in select id from public.purchases where received_on is not null loop
    perform public.sync_purchase_stock(v);
  end loop;
end $$;

insert into public.stock_movements (shop_id, product_id, qty, kind, reason, service_order_id, occurred_at, created_by_name)
select o.shop_id, i.product_id, -sum(i.qty), 'os', 'O.S. ' || o.number || ' · ' || coalesce(o.plate, ''), o.id,
       coalesce(o.exited_at, now()), 'Sistema'
  from public.service_orders o
  join lateral (select q.id from public.quotes q where q.service_order_id = o.id and q.status <> 'recusado'
                 order by q.created_at desc limit 1) q on true
  join public.quote_items i on i.quote_id = q.id and i.product_id is not null
 where o.status = 'finalizado'
 group by o.shop_id, o.id, o.number, o.plate, o.exited_at, i.product_id
having sum(i.qty) <> 0;
