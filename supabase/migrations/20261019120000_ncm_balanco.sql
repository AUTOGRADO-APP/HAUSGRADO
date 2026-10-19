-- =====================================================================
-- Hausgrado · NCM nos produtos e modo Balanço
--   NCM: 8 dígitos (exibido 0000.00.00), opcional.
--   Balanço: o ajuste manual de estoque (adjust_stock) só funciona com o modo Balanço ativo.
--     Ativa com a mesma senha de autorização do desconto (verify_discount_password: 5 erros em 15 min)
--     e vale 60 minutos para o usuário que ativou. O prazo fica no servidor.
--     Compras recebidas e O.S. finalizadas continuam mexendo no estoque normalmente.
-- =====================================================================

alter table public.products
  add column ncm text check (ncm is null or ncm ~ '^[0-9]{8}$');

create table public.stock_count_sessions (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id),
  user_id     uuid not null,
  user_name   text,
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.stock_count_sessions (user_id, expires_at desc);

alter table public.stock_count_sessions enable row level security;
-- leitura da própria oficina; gravação só pelas funções abaixo (security definer)
create policy stock_count_sessions_sel on public.stock_count_sessions for select to authenticated using (shop_id = public.current_shop_id());

-- prazo do balanço ativo do usuário (null = desligado)
create or replace function public.stock_count_until() returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(expires_at) from public.stock_count_sessions
   where user_id = auth.uid() and shop_id = public.current_shop_id() and ended_at is null and expires_at > now()
$$;

-- ativa (ou renova) o balanço por 60 min. Senha errada devolve null (a tentativa fica gravada).
create or replace function public.start_stock_count(p_password text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_shop uuid := public.current_shop_id(); v_until timestamptz := now() + interval '60 minutes';
begin
  if v_shop is null then raise exception 'Usuário sem oficina.'; end if;
  if not public.verify_discount_password(p_password) then return null; end if;
  update public.stock_count_sessions set ended_at = now()
   where user_id = auth.uid() and ended_at is null and expires_at > now();
  insert into public.stock_count_sessions (shop_id, user_id, user_name, expires_at)
  values (v_shop, auth.uid(), public.stock_author(), v_until);
  return v_until;
end $$;

create or replace function public.end_stock_count() returns void
language sql security definer set search_path = public as $$
  update public.stock_count_sessions set ended_at = now()
   where user_id = auth.uid() and ended_at is null and expires_at > now()
$$;

-- ajuste manual: só com o balanço ativo
create or replace function public.adjust_stock(p_product uuid, p_qty numeric, p_reason text) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_new numeric;
begin
  select shop_id into v_shop from public.products where id = p_product;
  if v_shop is null or v_shop <> public.current_shop_id() then raise exception 'Produto não encontrado.'; end if;
  if public.stock_count_until() is null then
    raise exception 'Ative o modo Balanço (botão Balanço em Produtos) para alterar o estoque.' using errcode = 'P0001';
  end if;
  if coalesce(p_qty, 0) = 0 then raise exception 'Informe uma quantidade diferente de zero.'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Informe o motivo do ajuste.'; end if;
  insert into public.stock_movements (shop_id, product_id, qty, kind, reason, created_by, created_by_name)
  values (v_shop, p_product, round(p_qty, 2), 'ajuste', trim(p_reason), auth.uid(), public.stock_author());
  select stock_qty into v_new from public.products where id = p_product;
  return v_new;
end $$;

-- Rodar no SQL Editor do Supabase (o conector não executa revoke)
revoke execute on function public.stock_count_until() from public, anon;
revoke execute on function public.start_stock_count(text) from public, anon;
revoke execute on function public.end_stock_count() from public, anon;
revoke execute on function public.adjust_stock(uuid, numeric, text) from public, anon;
grant execute on function public.stock_count_until() to authenticated;
grant execute on function public.start_stock_count(text) to authenticated;
grant execute on function public.end_stock_count() to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;
