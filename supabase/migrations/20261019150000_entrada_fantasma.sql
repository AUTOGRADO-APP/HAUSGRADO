-- =====================================================================
-- Hausgrado · Entrada FANTASMA (ajustes pontuais na implantação)
--   Só o master lança, em Financeiro > Entradas, uma entrada sem O.S., sem placa e sem cliente,
--   com a forma de pagamento "fantasma", valor digitado e nenhuma taxa.
--   Conta como recebido (Entradas, Gestão e Metas), mas não gera comissão, não mexe no estoque
--   e não consome a numeração das O.S. Só o master exclui.
-- =====================================================================

alter table public.receipts alter column service_order_id drop not null;
alter table public.receipts add column kind text not null default 'os' check (kind in ('os','fantasma'));
alter table public.receipts add column note text;
alter table public.receipts add constraint receipts_kind_os check ((kind = 'os') = (service_order_id is not null));

alter table public.receipt_payments drop constraint if exists receipt_payments_method_check;
alter table public.receipt_payments add constraint receipt_payments_method_check
  check (method in ('dinheiro','credito','debito','pix','fantasma'));

-- Lança a entrada fantasma. p_received_on = dia do recebimento (padrão hoje, nunca no futuro).
create or replace function public.add_ghost_receipt(p_amount numeric, p_received_on date default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_day date := coalesce(p_received_on, v_today);
  v_at timestamptz;
  v_id uuid;
begin
  if not public.is_master() then raise exception 'Só o usuário master pode lançar entrada fantasma.' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if v_day > v_today then raise exception 'A data não pode ser no futuro.'; end if;
  v_at := case when v_day = v_today then now() else (v_day + time '12:00') at time zone 'America/Sao_Paulo' end;
  insert into public.receipts (shop_id, service_order_id, kind, note, received_at, total, difference, received_by)
  values (public.current_shop_id(), null, 'fantasma', nullif(trim(coalesce(p_note, '')), ''), v_at, round(p_amount, 2), 0, auth.uid())
  returning id into v_id;
  insert into public.receipt_payments (shop_id, receipt_id, method, amount, installments, fee_pct)
  values (public.current_shop_id(), v_id, 'fantasma', round(p_amount, 2), 1, 0);
  return v_id;
end $$;

create or replace function public.delete_ghost_receipt(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master() then raise exception 'Só o usuário master pode excluir entrada fantasma.' using errcode = '42501'; end if;
  delete from public.receipts where id = p_id and kind = 'fantasma' and shop_id = public.current_shop_id();
  if not found then raise exception 'Entrada fantasma não encontrada.'; end if;
end $$;

revoke execute on function public.add_ghost_receipt(numeric, date, text) from public, anon;
revoke execute on function public.delete_ghost_receipt(uuid) from public, anon;
grant execute on function public.add_ghost_receipt(numeric, date, text) to authenticated;
grant execute on function public.delete_ghost_receipt(uuid) to authenticated;
