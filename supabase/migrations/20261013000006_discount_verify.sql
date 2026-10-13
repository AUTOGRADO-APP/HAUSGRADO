-- =====================================================================
-- Hausgrado · conferência da senha de desconto na tela (com limite de tentativas)
-- e tabelas no Realtime (quadro, sino, O.S. aberta e portal atualizam sozinhos).
-- =====================================================================

create table if not exists public.discount_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  ok          boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists discount_attempts_user_idx on public.discount_attempts (user_id, created_at);
alter table public.discount_attempts enable row level security;
-- sem policies: só a função abaixo (security definer) lê e grava

-- true = senha correta. Limite: 5 erros em 15 min por usuário.
create or replace function public.verify_discount_password(p_password text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_shop uuid := public.current_shop_id(); v_ok boolean; v_err int;
begin
  if v_shop is null then return false; end if;
  select count(*) into v_err from public.discount_attempts
   where user_id = auth.uid() and not ok and created_at > now() - interval '15 minutes';
  if v_err >= 5 then raise exception 'Muitas tentativas. Aguarde 15 minutos e tente de novo.'; end if;
  v_ok := public.check_discount_password(v_shop, p_password);
  insert into public.discount_attempts (user_id, ok) values (auth.uid(), v_ok);
  return v_ok;
end $$;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['service_orders','service_order_records','appointments','quotes'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Só usuários logados chamam a conferência (rodar no SQL Editor; o conector não executa revoke)
revoke execute on function public.verify_discount_password(text) from public, anon;
grant execute on function public.verify_discount_password(text) to authenticated;
