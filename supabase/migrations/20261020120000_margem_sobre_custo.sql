-- =====================================================================
-- Hausgrado · Margem do orçamento passa a ser acréscimo sobre o CUSTO (pedido do Vinícius em 2026-10-20)
--   Antes: preço mínimo = custo ÷ (1 − margem)  → 40% virava +66,7% sobre o custo.
--   Agora: preço mínimo = custo × (1 + margem)  → 40% sobre R$ 100 = R$ 140.
--   Arredondado PARA CIMA no centavo (mesma conta de minPartPrice() em src/lib/rules.ts).
--   Como é acréscimo, a margem mínima pode passar de 100% (limite 999%).
--   O trigger quote_items_margin continua o mesmo: só a função de preço mínimo muda.
-- =====================================================================

create or replace function public.min_part_price(p_cost numeric, p_pct numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when coalesce(p_pct, 0) <= 0 then 0
              else (ceil(round(coalesce(p_cost, 0) * 100) * (1 + p_pct / 100)) / 100)::numeric(12,2) end
$$;

alter table public.shops drop constraint if exists shops_min_part_margin_pct_check;
alter table public.shops add constraint shops_min_part_margin_pct_check
  check (min_part_margin_pct >= 0 and min_part_margin_pct <= 999);
