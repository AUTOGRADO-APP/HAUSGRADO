-- =====================================================================
-- Hausgrado · "Margem" do orçamento vira MARKUP: acréscimo sobre o CUSTO (pedido do Vinícius em 2026-10-20)
--   Antes: preço mínimo = custo ÷ (1 − margem)  → 40% virava +66,7% sobre o custo.
--   Agora: preço mínimo = custo × (1 + margem)  → 40% sobre R$ 100 = R$ 140.
--   Arredondado PARA CIMA no centavo (mesma conta de minPartPrice() em src/lib/rules.ts).
--   Como é acréscimo, a margem mínima pode passar de 100% (limite 999%).
--   A mensagem do trigger quote_items_margin passa a dizer "markup mínimo".
-- =====================================================================

create or replace function public.min_part_price(p_cost numeric, p_pct numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when coalesce(p_pct, 0) <= 0 then 0
              else (ceil(round(coalesce(p_cost, 0) * 100) * (1 + p_pct / 100)) / 100)::numeric(12,2) end
$$;

alter table public.shops drop constraint if exists shops_min_part_margin_pct_check;
alter table public.shops add constraint shops_min_part_margin_pct_check
  check (min_part_margin_pct >= 0 and min_part_margin_pct <= 999);

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
    raise exception 'Preço abaixo do markup mínimo de %: com custo de R$ %, o preço da peça "%" precisa ser de pelo menos R$ %.',
      replace(rtrim(rtrim(v_pct::text, '0'), '.'), '.', ',') || '%',
      replace(to_char(new.unit_cost, 'FM999999990.00'), '.', ','),
      coalesce(nullif(new.description, ''), 'sem descrição'),
      replace(to_char(v_min, 'FM999999990.00'), '.', ',')
      using errcode = '23514';
  end if;
  return new;
end $$;
