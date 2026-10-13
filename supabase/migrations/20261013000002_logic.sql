-- =====================================================================
-- Hausgrado · regras de negócio no banco (triggers e RPCs)
-- As regras críticas ficam aqui para valerem mesmo que alguém tente burlar a tela.
-- =====================================================================

-- ---------- formatação em reais (independe do locale do servidor) ----------
create or replace function public.brl(v numeric) returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(round(v, 2), 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.')
$$;

-- ---------- numeração sequencial por oficina ----------
create or replace function public.tg_os_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    update public.shops set os_seq = os_seq + 1 where id = new.shop_id returning os_seq into new.number;
  end if;
  return new;
end $$;
create trigger service_orders_number before insert on public.service_orders
  for each row execute function public.tg_os_number();

create or replace function public.tg_quote_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    update public.shops set quote_seq = quote_seq + 1 where id = new.shop_id returning quote_seq into new.number;
  end if;
  return new;
end $$;
create trigger quotes_number before insert on public.quotes
  for each row execute function public.tg_quote_number();

-- ---------- O.S.: histórico de status e proteção do "finalizado" ----------
create or replace function public.status_label(s text) returns text language sql immutable as $$
  select case s when 'orcamento' then 'Orçamento' when 'aprovado' then 'Aprovado' when 'pecas' then 'Aguardando peças'
                when 'servico' then 'Em serviço' when 'entrega' then 'Esperando entrega' when 'finalizado' then 'Finalizado' else s end
$$;

create or replace function public.tg_os_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (new.shop_id, new.id, 'Veículo deu entrada na oficina');
    return new;
  end if;
  if new.status is distinct from old.status then
    -- Regra: só finaliza pela função register_receipt() (que confere o pagamento).
    if new.status = 'finalizado' and coalesce(current_setting('hausgrado.finalizing', true), '') <> 'on' then
      raise exception 'Para finalizar a O.S., registre o pagamento (register_receipt).' using errcode = 'P0001';
    end if;
    if old.status = 'finalizado' and coalesce(current_setting('hausgrado.finalizing', true), '') <> 'on' then
      raise exception 'O.S. finalizada só volta pelo "Desfazer recebimento" (undo_receipt).' using errcode = 'P0001';
    end if;
    if new.status = 'finalizado' and new.exited_at is null then new.exited_at := now(); end if;
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (new.shop_id, new.id, 'Status: ' || public.status_label(new.status));
  end if;
  if new.technician_id is distinct from old.technician_id then
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (new.shop_id, new.id, coalesce('Responsável: ' || (select name from public.technicians where id = new.technician_id), 'Responsável removido'));
  end if;
  return new;
end $$;
create trigger service_orders_status after insert on public.service_orders
  for each row execute function public.tg_os_status();
create trigger service_orders_status_upd before update on public.service_orders
  for each row execute function public.tg_os_status();

-- ---------- orçamento: aprovar move a O.S.; desconto só via RPC ----------
create or replace function public.tg_quote_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.discount is distinct from old.discount and coalesce(current_setting('hausgrado.discount_ok', true), '') <> 'on' then
    raise exception 'Desconto exige a senha de autorização (apply_quote_discount).' using errcode = 'P0001';
  end if;
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' and new.service_order_id is not null then
    update public.service_orders set status = 'aprovado'
     where id = new.service_order_id and status = 'orcamento';
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (new.shop_id, new.service_order_id, 'Orçamento nº ' || new.number || ' aprovado' ||
            case when new.decided_by = 'cliente' then ' pelo cliente' else ' na oficina' end);
  end if;
  return new;
end $$;
create trigger quotes_rules before update on public.quotes
  for each row execute function public.tg_quote_rules();

create or replace function public.quote_total(p_quote uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(qty * unit_price) from public.quote_items where quote_id = p_quote), 0)
       - coalesce((select discount from public.quotes where id = p_quote), 0)
$$;

-- Total a receber de uma O.S. = total do orçamento ligado (se não recusado)
create or replace function public.os_total(p_os uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select public.quote_total(q.id) from public.quotes q
                    where q.service_order_id = p_os and q.status <> 'recusado'
                    order by q.created_at desc limit 1), 0)
$$;

-- ---------- senha de autorização de desconto ----------
create or replace function public.set_discount_password(p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_master() then raise exception 'Somente o usuário master pode definir a senha.'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'A senha precisa ter pelo menos 4 caracteres.'; end if;
  insert into public.shop_secrets (shop_id, discount_password_hash, discount_password_set_at, discount_password_set_by)
  values (public.current_shop_id(), crypt(p_password, gen_salt('bf')), now(), auth.uid())
  on conflict (shop_id) do update set discount_password_hash = excluded.discount_password_hash,
     discount_password_set_at = now(), discount_password_set_by = auth.uid();
end $$;

create or replace function public.check_discount_password(p_shop uuid, p_password text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select discount_password_hash = crypt(coalesce(p_password, ''), discount_password_hash)
                     from public.shop_secrets where shop_id = p_shop and discount_password_hash is not null), false)
$$;
revoke all on function public.check_discount_password(uuid, text) from public, anon, authenticated;

create or replace function public.discount_password_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('active', s.discount_password_hash is not null, 'set_at', s.discount_password_set_at,
                            'set_by', (select full_name from public.profiles where id = s.discount_password_set_by))
    from public.shop_secrets s where s.shop_id = public.current_shop_id()
$$;

create or replace function public.apply_quote_discount(p_quote uuid, p_amount numeric, p_password text) returns void
language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_sub numeric; v_os uuid; v_num int;
begin
  select shop_id, service_order_id, number into v_shop, v_os, v_num from public.quotes where id = p_quote;
  if v_shop is null or v_shop <> public.current_shop_id() then raise exception 'Orçamento não encontrado.'; end if;
  if not public.check_discount_password(v_shop, p_password) then raise exception 'Senha de autorização incorreta.'; end if;
  select coalesce(sum(qty * unit_price), 0) into v_sub from public.quote_items where quote_id = p_quote;
  if p_amount < 0 or p_amount > v_sub then raise exception 'O desconto não pode ser maior que o subtotal.'; end if;
  perform set_config('hausgrado.discount_ok', 'on', true);
  update public.quotes set discount = p_amount where id = p_quote;
  perform set_config('hausgrado.discount_ok', 'off', true);
  if v_os is not null then
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (v_shop, v_os, 'Desconto de ' || public.brl(p_amount) || ' no orçamento nº ' || v_num || ' autorizado com senha de administrador');
  end if;
end $$;

-- ---------- recebimento + finalização (transação única) ----------
-- p_payments: [{"method":"pix","amount":300},{"method":"credito","amount":413.6,"installments":3}]
create or replace function public.register_receipt(p_os uuid, p_payments jsonb, p_password text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_os record; v_total numeric; v_sum numeric := 0; v_diff numeric; v_auth boolean := false;
  v_receipt uuid; v_p jsonb; v_fee numeric := 0; v_pct numeric; v_shop public.shops%rowtype; v_desc text := '';
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
  end loop;

  if v_fee > 0 then
    insert into public.expenses (shop_id, description, category, amount, due_date, paid, paid_on, source, receipt_id, service_order_id)
    values (v_os.shop_id, 'Taxas O.S. ' || v_os.number || ' (' || v_desc || ')', 'Taxa de pagamento', v_fee,
            current_date, true, current_date, 'fee', v_receipt, p_os);
  end if;

  perform set_config('hausgrado.finalizing', 'on', true);
  update public.service_orders set status = 'finalizado' where id = p_os;
  perform set_config('hausgrado.finalizing', 'off', true);

  insert into public.service_order_history (shop_id, service_order_id, text)
  values (v_os.shop_id, p_os, case when v_sum > 0 then 'Pagamento recebido: ' || public.brl(v_sum) else 'Finalizada sem cobrança' end);
  if v_auth then
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (v_os.shop_id, p_os, 'Desconto de ' || public.brl(-v_diff) || ' autorizado com senha de administrador');
  end if;
  return v_receipt;
end $$;

-- Desfazer o recebimento (botão "Desfazer" logo após finalizar): só master/admin
create or replace function public.undo_receipt(p_os uuid, p_previous_status text default 'entrega') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fin() then raise exception 'Somente master ou administrador podem desfazer um recebimento.'; end if;
  delete from public.receipts where service_order_id = p_os and shop_id = public.current_shop_id();
  delete from public.commission_payments where service_order_id = p_os and shop_id = public.current_shop_id();
  if p_previous_status not in ('orcamento','aprovado','pecas','servico','entrega') then raise exception 'Status inválido.'; end if;
  perform set_config('hausgrado.finalizing', 'on', true);
  update public.service_orders set status = p_previous_status, exited_at = null where id = p_os and shop_id = public.current_shop_id();
  perform set_config('hausgrado.finalizing', 'off', true);
  insert into public.service_order_history (shop_id, service_order_id, text)
  values (public.current_shop_id(), p_os, 'Recebimento desfeito');
end $$;

-- ---------- compras → despesa "Compra de mercadorias" (sempre sincronizada) ----------
create or replace function public.sync_purchase_expense(p_purchase uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v record; v_total numeric; v_sup text;
begin
  select * into v from public.purchases where id = p_purchase;
  if v.id is null then return; end if;
  select coalesce(sum(qty * unit_cost), 0) + v.freight into v_total from public.purchase_items where purchase_id = p_purchase;
  select name into v_sup from public.suppliers where id = v.supplier_id;
  if v_total <= 0 then delete from public.expenses where purchase_id = p_purchase; return; end if;
  insert into public.expenses (shop_id, description, category, amount, due_date, payment_code, paid, paid_on, source, purchase_id)
  values (v.shop_id, v_sup || coalesce(' · NF ' || v.invoice_number, ''), 'Compra de mercadorias', v_total,
          coalesce(case when v.payment_method = 'boleto' then v.due_date end, v.purchased_on), v.payment_code,
          v.paid, v.paid_on, 'purchase', v.id)
  on conflict (purchase_id) do update set description = excluded.description, amount = excluded.amount,
     due_date = excluded.due_date, payment_code = excluded.payment_code, paid = excluded.paid, paid_on = excluded.paid_on;
end $$;

create or replace function public.tg_purchase_defaults() returns trigger
language plpgsql as $$
begin
  if new.payment_method <> 'boleto' then
    new.due_date := null; new.paid := true; new.paid_on := coalesce(new.paid_on, new.purchased_on);
  elsif not new.paid then new.paid_on := null;
  end if;
  return new;
end $$;
create trigger purchases_defaults before insert or update on public.purchases
  for each row execute function public.tg_purchase_defaults();

create or replace function public.tg_purchase_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_purchase_expense(coalesce(new.purchase_id, old.purchase_id));
  return null;
end $$;
create or replace function public.tg_purchase_sync_self() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.sync_purchase_expense(new.id); return null; end $$;
create trigger purchases_sync after insert or update on public.purchases
  for each row execute function public.tg_purchase_sync_self();
create trigger purchase_items_sync after insert or update or delete on public.purchase_items
  for each row execute function public.tg_purchase_sync();

-- Pagar a despesa de uma compra também marca a compra como paga (e vice-versa via sync)
create or replace function public.tg_expense_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'purchase' and new.paid is distinct from old.paid then
    update public.purchases set paid = new.paid, paid_on = new.paid_on where id = new.purchase_id and paid is distinct from new.paid;
  end if;
  return null;
end $$;
create trigger expenses_paid after update on public.expenses
  for each row execute function public.tg_expense_paid();

-- ---------- comissões ----------
create or replace function public.os_labor_total(p_os uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(i.qty * i.unit_price) from public.quote_items i
                    join public.quotes q on q.id = i.quote_id
                   where q.service_order_id = p_os and q.status <> 'recusado' and i.kind = 'mao'), 0)
$$;

create or replace function public.tg_commission_expense() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pct numeric; v_val numeric; v_os record;
begin
  if tg_op = 'DELETE' then
    delete from public.expenses where source = 'commission' and service_order_id = old.service_order_id;
    return null;
  end if;
  select o.*, t.name as tech_name into v_os from public.service_orders o left join public.technicians t on t.id = o.technician_id where o.id = new.service_order_id;
  select commission_pct into v_pct from public.shops where id = new.shop_id;
  v_val := round(public.os_labor_total(new.service_order_id) * v_pct / 100, 2);
  if v_val > 0 then
    insert into public.expenses (shop_id, description, category, amount, due_date, paid, paid_on, source, service_order_id)
    values (new.shop_id, 'Comissão ' || coalesce(v_os.tech_name, 'sem responsável') || ' · O.S. ' || v_os.number, 'Comissão', v_val,
            new.paid_at::date, true, new.paid_at::date, 'commission', new.service_order_id);
  end if;
  return null;
end $$;
create trigger commission_expense after insert or delete on public.commission_payments
  for each row execute function public.tg_commission_expense();

-- ---------- visão de comissões (base: O.S. finalizadas) ----------
create or replace view public.v_commissions with (security_invoker = true) as
select o.shop_id, o.id as service_order_id, o.number, o.plate, o.exited_at, o.technician_id, t.name as technician_name,
       public.os_labor_total(o.id) as labor_total,
       round(public.os_labor_total(o.id) * s.commission_pct / 100, 2) as commission,
       cp.paid_at
  from public.service_orders o
  join public.shops s on s.id = o.shop_id
  left join public.technicians t on t.id = o.technician_id
  left join public.commission_payments cp on cp.service_order_id = o.id
 where o.status = 'finalizado';

-- ---------- portal do cliente (chamado só pela Edge Function, com service_role) ----------
create or replace function public.portal_get(p_token text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_os record; v_phone text; v_tries int; v_q record;
begin
  select count(*) into v_tries from public.portal_attempts where token = p_token and not ok and created_at > now() - interval '15 minutes';
  if v_tries >= 5 then return jsonb_build_object('error', 'Muitas tentativas. Aguarde 15 minutos.'); end if;
  select o.*, c.phone as customer_phone, c.name as customer_name, s.name as shop_name
    into v_os from public.service_orders o join public.customers c on c.id = o.customer_id join public.shops s on s.id = o.shop_id
   where o.portal_token = p_token;
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) > 11 and v_phone like '55%' then v_phone := substr(v_phone, 3); end if;
  if v_os.id is null or v_phone <> v_os.customer_phone then
    -- devolve erro em vez de raise: assim a tentativa falha fica gravada (raise desfaria o insert)
    insert into public.portal_attempts (token, ok) values (p_token, false);
    return jsonb_build_object('error', 'Celular não confere.');
  end if;
  insert into public.portal_attempts (token, ok) values (p_token, true);
  select * into v_q from public.quotes where service_order_id = v_os.id order by created_at desc limit 1;
  return jsonb_build_object(
    'shop', v_os.shop_name, 'number', v_os.number, 'plate', v_os.plate, 'make', v_os.make, 'model', v_os.model,
    'customer_first_name', split_part(v_os.customer_name, ' ', 1), 'status', v_os.status,
    'entered_at', v_os.entered_at, 'exited_at', v_os.exited_at,
    'last_update', (select jsonb_build_object('at', created_at, 'text', text) from public.service_order_history where service_order_id = v_os.id order by created_at desc limit 1),
    'quote', case when v_q.id is null then null else jsonb_build_object('id', v_q.id, 'number', v_q.number, 'status', v_q.status,
       'discount', v_q.discount, 'total', public.quote_total(v_q.id),
       'items', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'description', description, 'details', details, 'qty', qty, 'unit_price', unit_price) order by position), '[]') from public.quote_items where quote_id = v_q.id)) end,
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('position', position, 'path', storage_path)), '[]') from public.service_order_photos where service_order_id = v_os.id),
    'records', (select coalesce(jsonb_agg(jsonb_build_object('tab', tab, 'path', storage_path, 'mime', mime, 'description', description, 'at', created_at) order by created_at desc), '[]') from public.service_order_records where service_order_id = v_os.id)
  );
end $$;

create or replace function public.portal_decide_quote(p_token text, p_phone text, p_decision text) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if p_decision not in ('aprovado','recusado') then raise exception 'Decisão inválida.'; end if;
  v := public.portal_get(p_token, p_phone);
  if v ? 'error' then raise exception '%', v->>'error'; end if;
  update public.quotes set status = p_decision, decided_at = now(), decided_by = 'cliente'
   where id = (v->'quote'->>'id')::uuid and status in ('rascunho','enviado');
end $$;

revoke all on function public.portal_get(text, text) from public, anon, authenticated;
revoke all on function public.portal_decide_quote(text, text, text) from public, anon, authenticated;
grant execute on function public.portal_get(text, text) to service_role;
grant execute on function public.portal_decide_quote(text, text, text) to service_role;
