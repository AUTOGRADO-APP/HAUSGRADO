-- Hausgrado · token da API de placas guardado no servidor (shop_secrets).
-- O master grava pela tela de Configurações (set_plate_api_token); ninguém lê o token pelo app:
-- só a Edge Function plate-lookup, com a service_role.

alter table public.shop_secrets
  add column if not exists plate_api_token        text,
  add column if not exists plate_api_token_set_at timestamptz,
  add column if not exists plate_api_token_set_by uuid;

create or replace function public.set_plate_api_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare v_tok text := nullif(btrim(coalesce(p_token, '')), '');
begin
  if not public.is_master() then raise exception 'Somente o usuário master pode definir o token.'; end if;
  if v_tok is not null and length(v_tok) < 16 then raise exception 'Token inválido.'; end if;
  insert into public.shop_secrets (shop_id, plate_api_token, plate_api_token_set_at, plate_api_token_set_by)
  values (public.current_shop_id(), v_tok, now(), auth.uid())
  on conflict (shop_id) do update set plate_api_token = excluded.plate_api_token,
     plate_api_token_set_at = now(), plate_api_token_set_by = auth.uid();
end $$;
revoke all on function public.set_plate_api_token(text) from public, anon;
grant execute on function public.set_plate_api_token(text) to authenticated;

-- Situação do token para a tela (nunca devolve o token, só os 4 últimos caracteres)
create or replace function public.plate_api_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_master() then
    (select jsonb_build_object('active', s.plate_api_token is not null, 'set_at', s.plate_api_token_set_at,
              'set_by', (select full_name from public.profiles where id = s.plate_api_token_set_by),
              'last4', right(s.plate_api_token, 4))
       from public.shop_secrets s where s.shop_id = public.current_shop_id())
  end
$$;
revoke all on function public.plate_api_status() from public, anon;
grant execute on function public.plate_api_status() to authenticated;

-- Token colado por engano no campo "Provedor" (visível para todos os usuários): move para shop_secrets.
insert into public.shop_secrets (shop_id, plate_api_token, plate_api_token_set_at)
select id, btrim(plate_api_provider), now() from public.shops
 where btrim(coalesce(plate_api_provider, '')) ~ '^[0-9A-Fa-f]{32,}$'
on conflict (shop_id) do update set plate_api_token = excluded.plate_api_token, plate_api_token_set_at = now();
update public.shops set plate_api_provider = 'Placa FIPE'
 where btrim(coalesce(plate_api_provider, '')) ~ '^[0-9A-Fa-f]{32,}$';
