-- =====================================================================
-- Hausgrado · metas de faturamento (Financeiro > Metas)
--   Uma linha por mês: META e SUPER META (a super meta precisa ser maior ou igual à meta).
--   O faturamento comparado é o recebido no mês (receipts.total pela data do recebimento),
--   o mesmo que a página Entradas mostra.
--   Leitura e escrita: só master/admin, como o resto do financeiro.
-- =====================================================================

create table public.revenue_goals (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null default public.current_shop_id() references public.shops(id),
  month       date not null check (extract(day from month) = 1),   -- primeiro dia do mês
  goal        numeric(12,2) not null check (goal > 0),
  super_goal  numeric(12,2) not null,
  updated_by  uuid references public.profiles(id) default auth.uid(),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint revenue_goals_super_ck check (super_goal >= goal),
  constraint revenue_goals_month_uq unique (shop_id, month)
);

alter table public.revenue_goals enable row level security;
create policy revenue_goals_fin on public.revenue_goals for all to authenticated
  using (shop_id = public.current_shop_id() and public.is_fin())
  with check (shop_id = public.current_shop_id() and public.is_fin());
revoke all on public.revenue_goals from anon;

create or replace function public.revenue_goals_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger revenue_goals_touch before update on public.revenue_goals
  for each row execute function public.revenue_goals_touch();
revoke execute on function public.revenue_goals_touch() from public, anon;
