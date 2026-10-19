-- =====================================================================
-- Hausgrado · Margem mínima de peças no orçamento (pedido do Vinícius em 2026-10-19)
--   shops.min_part_margin_pct: margem mínima (%) para itens do tipo PEÇA. 0 = sem mínimo.
--     Só o master altera (a policy shops_upd já é só do master).
--   quote_items.unit_cost: custo unitário da linha (vem do produto cadastrado; peça avulsa digita).
--     Fica só na tela da oficina: portal, PDF e WhatsApp continuam mostrando só o preço.
--   Margem = (preço − custo) ÷ preço, a mesma da página Produtos.
--   Preço mínimo = custo ÷ (1 − margem mínima), arredondado PARA CIMA no centavo.
--   Peça com preço R$ 0 (garantia, cortesia) não entra na regra. Mão de obra também não.
--   Vale para todos os perfis, sem exceção. Mudar o mínimo não mexe em itens já gravados:
--   a regra é conferida quando o preço, o custo ou o tipo do item mudam.
-- =====================================================================

alter table public.shops
  add column min_part_margin_pct numeric(5,2) not null default 0
  check (min_part_margin_pct >= 0 and min_part_margin_pct < 100);

alter table public.quote_items
  add column unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0);

-- preço mínimo de uma peça (mesma conta de minPartPrice() em src/lib/rules.ts)
create or replace function public.min_part_price(p_cost numeric, p_pct numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when coalesce(p_pct, 0) <= 0 then 0
              else (ceil(round(coalesce(p_cost, 0) * 100) / (1 - p_pct / 100)) / 100)::numeric(12,2) end
$$;

create or replace function public.tg_quote_items_margin() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pct numeric; v_min numeric;
begin
  if new.kind <> 'peca' or new.unit_price <= 0 then return new; end if;
  if tg_op = 'UPDATE' and new.kind = old.kind and new.unit_price = old.unit_price and new.unit_cost = old.unit_cost then
    return new;
  end if;
  select min_part_margin_pct into v_pct from public.shops where id = new.shop_id;
  if coalesce(v_pct, 0) <= 0 then return new; end if;
  v_min := public.min_part_price(new.unit_cost, v_pct);
  if new.unit_price < v_min then
    raise exception 'Preço abaixo da margem mínima de %: com custo de R$ %, o preço da peça "%" precisa ser de pelo menos R$ %.',
      replace(rtrim(rtrim(v_pct::text, '0'), '.'), '.', ',') || '%',
      replace(to_char(new.unit_cost, 'FM999999990.00'), '.', ','),
      coalesce(nullif(new.description, ''), 'sem descrição'),
      replace(to_char(v_min, 'FM999999990.00'), '.', ',')
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists quote_items_margin on public.quote_items;
create trigger quote_items_margin before insert or update on public.quote_items
  for each row execute function public.tg_quote_items_margin();
