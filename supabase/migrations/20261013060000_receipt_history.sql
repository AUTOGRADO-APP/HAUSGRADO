-- Histórico do recebimento com as formas (seção 7.15):
--   "Pagamento recebido: Pix R$ 300,00 + Cartão de crédito 3x R$ 413,60"
-- e a despesa de taxa datada pelo dia de São Paulo (antes usava current_date do servidor, em UTC,
-- e recebimentos depois das 21h caíam no dia seguinte).
create or replace function public.register_receipt(p_os uuid, p_payments jsonb, p_password text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_os record; v_total numeric; v_sum numeric := 0; v_diff numeric; v_auth boolean := false;
  v_receipt uuid; v_p jsonb; v_fee numeric := 0; v_pct numeric; v_shop public.shops%rowtype; v_desc text := '';
  v_forms text := ''; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_os from public.service_orders where id = p_os for update;
  if v_os.id is null or v_os.shop_id <> public.current_shop_id() then raise exception 'O.S. não encontrada.'; end if;
  if v_os.status = 'finalizado' then raise exception 'Esta O.S. já está finalizada.'; end if;
  select * into v_shop from public.shops where id = v_os.shop_id;
  v_total := public.os_total(p_os);
  select coalesce(sum((x->>'amount')::numeric), 0) into v_sum from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) x;
  v_diff := round(v_sum - v_total, 2);
  if v_total > 0 and v_sum <= 0 then raise exception 'Informe o valor recebido.'; end if;
  if v_diff < 0 then
    if not public.check_discount_password(v_os.shop_id, p_password) then
      raise exception 'Faltam %. Para dar desconto, informe a senha de autorização.', public.brl(-v_diff);
    end if;
    v_auth := true;
  end if;

  insert into public.receipts (shop_id, service_order_id, total, difference, discount_authorized, received_by)
  values (v_os.shop_id, p_os, v_sum, v_diff, v_auth, auth.uid()) returning id into v_receipt;

  for v_p in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    continue when coalesce((v_p->>'amount')::numeric, 0) <= 0;
    v_pct := case v_p->>'method'
               when 'debito' then v_shop.fee_debit_pct
               when 'pix' then v_shop.fee_pix_pct
               when 'credito' then v_shop.fee_credit_pct[greatest(1, least(12, coalesce((v_p->>'installments')::int, 1)))]
               else 0 end;
    insert into public.receipt_payments (shop_id, receipt_id, method, amount, installments, fee_pct)
    values (v_os.shop_id, v_receipt, v_p->>'method', (v_p->>'amount')::numeric,
            case when v_p->>'method' = 'credito' then coalesce((v_p->>'installments')::int, 1) else 1 end, v_pct);
    if v_pct > 0 then
      v_fee := v_fee + round((v_p->>'amount')::numeric * v_pct / 100, 2);
      v_desc := v_desc || case when v_desc = '' then '' else ' + ' end ||
        case v_p->>'method' when 'credito' then 'Cartão de crédito ' || coalesce((v_p->>'installments')::int, 1) || 'x'
                            when 'debito' then 'Cartão de débito' else 'Pix' end || ' ' || replace(v_pct::text, '.', ',') || '%';
    end if;
    v_forms := v_forms || case when v_forms = '' then '' else ' + ' end ||
      case v_p->>'method' when 'credito' then 'Cartão de crédito ' || coalesce((v_p->>'installments')::int, 1) || 'x'
                          when 'debito' then 'Cartão de débito' when 'dinheiro' then 'Dinheiro' else 'Pix' end
      || ' ' || public.brl((v_p->>'amount')::numeric);
  end loop;

  if v_fee > 0 then
    insert into public.expenses (shop_id, description, category, amount, due_date, paid, paid_on, source, receipt_id, service_order_id)
    values (v_os.shop_id, 'Taxas O.S. ' || v_os.number || ' (' || v_desc || ')', 'Taxa de pagamento', v_fee,
            v_today, true, v_today, 'fee', v_receipt, p_os);
  end if;

  perform set_config('hausgrado.finalizing', 'on', true);
  update public.service_orders set status = 'finalizado' where id = p_os;
  perform set_config('hausgrado.finalizing', 'off', true);

  insert into public.service_order_history (shop_id, service_order_id, text)
  values (v_os.shop_id, p_os, case when v_forms <> '' then 'Pagamento recebido: ' || v_forms else 'Finalizada sem cobrança' end);
  if v_auth then
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (v_os.shop_id, p_os, 'Desconto de ' || public.brl(-v_diff) || ' autorizado com senha de administrador');
  end if;
  return v_receipt;
end $$;
