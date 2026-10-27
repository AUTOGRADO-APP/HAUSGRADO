-- =====================================================================
-- Hausgrado · Balanço por 3 horas (antes 60 min)
--   Só muda o prazo de start_stock_count(); o resto do modo Balanço (20261019120000_ncm_balanco.sql) continua igual.
-- =====================================================================

create or replace function public.start_stock_count(p_password text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_shop uuid := public.current_shop_id(); v_until timestamptz := now() + interval '3 hours';
begin
  if v_shop is null then raise exception 'Usuário sem oficina.'; end if;
  if not public.verify_discount_password(p_password) then return null; end if;
  update public.stock_count_sessions set ended_at = now()
   where user_id = auth.uid() and ended_at is null and expires_at > now();
  insert into public.stock_count_sessions (shop_id, user_id, user_name, expires_at)
  values (v_shop, auth.uid(), public.stock_author(), v_until);
  return v_until;
end $$;

revoke execute on function public.start_stock_count(text) from public, anon;
grant execute on function public.start_stock_count(text) to authenticated;
