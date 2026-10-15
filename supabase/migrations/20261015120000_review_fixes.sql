-- =====================================================================
-- Hausgrado · correções da revisão geral de 15/10/2026
--   1. Um orçamento ativo por O.S.; o valor da O.S. vem do aprovado (senão do mais recente não recusado).
--      Total, comissão e baixa de estoque usam o MESMO orçamento (os_quote).
--   2. Orçamento aprovado fica travado (volta para Rascunho para editar); com a O.S. finalizada, travado de vez.
--   3. Senha de desconto: aplicar desconto ou fechar com valor menor exige ter conferido a senha
--      (verify_discount_password, limitada a 5 erros em 15 min) nos últimos 15 minutos.
--   4. O.S. finalizada não pode ser excluída (o dinheiro dela sumiria do Financeiro).
--   5. Desconto nunca maior que o total dos itens.
--   6. undo_receipt só em O.S. finalizada; register_receipt recusa valores negativos e parcelas fora de 1–12.
--   7. Visitantes sem login não executam nenhuma função; search_path fixo nas funções apontadas pelo Supabase.
-- =====================================================================

-- ---------- 1. orçamento que vale para a O.S. ----------
create or replace function public.os_quote(p_os uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select q.id from public.quotes q
   where q.service_order_id = p_os and q.status <> 'recusado'
   order by (q.status = 'aprovado') desc, q.created_at desc
   limit 1
$$;

create or replace function public.os_total(p_os uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(public.quote_total(public.os_quote(p_os)), 0)
$$;

create or replace function public.os_labor_total(p_os uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(i.qty * i.unit_price) from public.quote_items i
                    where i.quote_id = public.os_quote(p_os) and i.kind = 'mao'), 0)
$$;

create or replace function public.tg_os_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_q uuid;
begin
  if new.status = 'finalizado' and old.status is distinct from 'finalizado' then
    v_q := public.os_quote(new.id);
    if v_q is not null then
      insert into public.stock_movements (shop_id, product_id, qty, kind, reason, service_order_id, created_by, created_by_name)
      select new.shop_id, i.product_id, -sum(i.qty), 'os', 'O.S. ' || new.number || ' · ' || coalesce(new.plate, ''),
             new.id, auth.uid(), public.stock_author()
        from public.quote_items i
       where i.quote_id = v_q and i.product_id is not null
       group by i.product_id
      having sum(i.qty) <> 0;
    end if;
  elsif old.status = 'finalizado' and new.status is distinct from 'finalizado' then
    delete from public.stock_movements where service_order_id = new.id and kind = 'os';
  end if;
  return null;
end $$;

-- ---------- 1 e 2. regras do orçamento ----------
create or replace function public.tg_quote_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fin boolean; v_other int;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.service_orders where id = old.service_order_id and status = 'finalizado') then
      raise exception 'A O.S. deste orçamento já foi finalizada: o orçamento não pode ser excluído.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  select exists (select 1 from public.service_orders
                  where id in (new.service_order_id, case when tg_op = 'UPDATE' then old.service_order_id end)
                    and status = 'finalizado') into v_fin;

  if tg_op = 'UPDATE' then
    if v_fin and (new.status is distinct from old.status or new.discount is distinct from old.discount
                  or new.service_order_id is distinct from old.service_order_id) then
      raise exception 'A O.S. deste orçamento já foi finalizada: o orçamento não pode mais mudar.' using errcode = 'P0001';
    end if;
    if old.status = 'aprovado' and new.status = 'aprovado'
       and (new.discount is distinct from old.discount or new.service_order_id is distinct from old.service_order_id) then
      raise exception 'Orçamento aprovado não pode ser alterado. Volte para Rascunho para editar (o cliente precisa aprovar de novo).' using errcode = 'P0001';
    end if;
  elsif v_fin then
    raise exception 'Esta O.S. já foi finalizada: não dá para criar orçamento para ela.' using errcode = 'P0001';
  end if;

  if new.service_order_id is not null and new.status <> 'recusado'
     and (tg_op = 'INSERT' or new.service_order_id is distinct from old.service_order_id or old.status = 'recusado') then
    select q.number into v_other from public.quotes q
     where q.service_order_id = new.service_order_id and q.status <> 'recusado' and q.id <> new.id limit 1;
    if v_other is not null then
      raise exception 'Esta O.S. já tem o orçamento nº %. Edite esse orçamento ou marque-o como recusado antes de usar outro.', v_other using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger quotes_guard before insert or update or delete on public.quotes
  for each row execute function public.tg_quote_guard();

create or replace function public.tg_quote_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_q record;
begin
  select q.status, q.number, o.status as os_status into v_q
    from public.quotes q left join public.service_orders o on o.id = q.service_order_id
   where q.id = coalesce(new.quote_id, old.quote_id);
  if not found then return coalesce(new, old); end if;   -- orçamento sendo excluído (cascade)
  if v_q.os_status = 'finalizado' then
    raise exception 'A O.S. deste orçamento já foi finalizada: os itens não podem mais mudar.' using errcode = 'P0001';
  end if;
  if v_q.status = 'aprovado' then
    raise exception 'Orçamento aprovado não pode ser alterado. Volte para Rascunho para editar (o cliente precisa aprovar de novo).' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger quote_items_guard before insert or update or delete on public.quote_items
  for each row execute function public.tg_quote_items_guard();

-- 5. desconto nunca maior que o total dos itens
create or replace function public.tg_quote_items_discount() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.quote_id, old.quote_id); v_disc numeric; v_sub numeric;
begin
  select discount into v_disc from public.quotes where id = v_id;
  if coalesce(v_disc, 0) <= 0 then return null; end if;
  select coalesce(sum(qty * unit_price), 0) into v_sub from public.quote_items where quote_id = v_id;
  if v_disc > v_sub then
    raise exception 'O desconto de % ficaria maior que o total dos itens (%). Diminua o desconto antes.', public.brl(v_disc), public.brl(v_sub) using errcode = 'P0001';
  end if;
  return null;
end $$;
create trigger quote_items_discount after insert or update or delete on public.quote_items
  for each row execute function public.tg_quote_items_discount();

-- ---------- 3. senha de desconto: só depois de conferida (com limite de tentativas) ----------
-- verify_discount_password() grava cada tentativa e bloqueia após 5 erros em 15 min.
-- As funções que aplicam o desconto exigem uma conferência certa recente do mesmo usuário,
-- verificada ANTES de olhar a senha: chamar a função direto não serve para adivinhar.
create or replace function public.discount_password_ok(p_shop uuid, p_password text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.discount_attempts
                  where user_id = auth.uid() and ok and created_at > now() - interval '15 minutes') then
    raise exception 'Confira a senha de autorização antes de aplicar o desconto.' using errcode = 'P0001';
  end if;
  return public.check_discount_password(p_shop, p_password);
end $$;
revoke execute on function public.discount_password_ok(uuid, text) from public, anon, authenticated;

create or replace function public.apply_quote_discount(p_quote uuid, p_amount numeric, p_password text) returns void
language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_sub numeric; v_os uuid; v_num int;
begin
  select shop_id, service_order_id, number into v_shop, v_os, v_num from public.quotes where id = p_quote;
  if v_shop is null or v_shop <> public.current_shop_id() then raise exception 'Orçamento não encontrado.'; end if;
  if not public.discount_password_ok(v_shop, p_password) then raise exception 'Senha de autorização incorreta.'; end if;
  select coalesce(sum(qty * unit_price), 0) into v_sub from public.quote_items where quote_id = p_quote;
  if p_amount is null or p_amount < 0 or p_amount > v_sub then raise exception 'O desconto não pode ser maior que o subtotal.'; end if;
  perform set_config('hausgrado.discount_ok', 'on', true);
  update public.quotes set discount = p_amount where id = p_quote;
  perform set_config('hausgrado.discount_ok', 'off', true);
  if v_os is not null then
    insert into public.service_order_history (shop_id, service_order_id, text)
    values (v_shop, v_os, 'Desconto de ' || public.brl(p_amount) || ' no orçamento nº ' || v_num || ' autorizado com senha de administrador');
  end if;
end $$;

-- ---------- 3 e 6. recebimento ----------
create or replace function public.register_receipt(p_os uuid, p_payments jsonb, p_password text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_os record; v_total numeric; v_sum numeric := 0; v_diff numeric; v_auth boolean := false;
  v_receipt uuid; v_p jsonb; v_fee numeric := 0; v_pct numeric; v_shop public.shops%rowtype; v_desc text := '';
  v_forms text := ''; v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_n int;
begin
  select * into v_os from public.service_orders where id = p_os for update;
  if v_os.id is null or v_os.shop_id <> public.current_shop_id() then raise exception 'O.S. não encontrada.'; end if;
  if v_os.status = 'finalizado' then raise exception 'Esta O.S. já está finalizada.'; end if;
  if jsonb_typeof(coalesce(p_payments, '[]'::jsonb)) <> 'array' then raise exception 'Formas de pagamento inválidas.'; end if;
  for v_p in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    if coalesce(v_p->>'method', '') not in ('dinheiro','credito','debito','pix') then raise exception 'Forma de pagamento inválida.'; end if;
    if (v_p->>'amount') is null or (v_p->>'amount')::numeric < 0 then raise exception 'Valor de pagamento inválido.'; end if;
    v_n := coalesce((v_p->>'installments')::int, 1);
    if v_n < 1 or v_n > 12 then raise exception 'Parcelas devem ficar entre 1 e 12.'; end if;
  end loop;
  select * into v_shop from public.shops where id = v_os.shop_id;
  v_total := public.os_total(p_os);
  select coalesce(sum((x->>'amount')::numeric), 0) into v_sum from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) x;
  v_diff := round(v_sum - v_total, 2);
  if v_total > 0 and v_sum <= 0 then raise exception 'Informe o valor recebido.'; end if;
  if v_diff < 0 then
    if p_password is null or not public.discount_password_ok(v_os.shop_id, p_password) then
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
               when 'credito' then v_shop.fee_credit_pct[coalesce((v_p->>'installments')::int, 1)]
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

create or replace function public.undo_receipt(p_os uuid, p_previous_status text default 'entrega') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fin() then raise exception 'Somente master ou administrador podem desfazer um recebimento.'; end if;
  if p_previous_status not in ('orcamento','aprovado','pecas','servico','entrega') then raise exception 'Status inválido.'; end if;
  if not exists (select 1 from public.service_orders where id = p_os and shop_id = public.current_shop_id() and status = 'finalizado') then
    raise exception 'Esta O.S. não está finalizada.';
  end if;
  delete from public.receipts where service_order_id = p_os and shop_id = public.current_shop_id();
  delete from public.commission_payments where service_order_id = p_os and shop_id = public.current_shop_id();
  perform set_config('hausgrado.finalizing', 'on', true);
  update public.service_orders set status = p_previous_status, exited_at = null where id = p_os and shop_id = public.current_shop_id();
  perform set_config('hausgrado.finalizing', 'off', true);
  insert into public.service_order_history (shop_id, service_order_id, text)
  values (public.current_shop_id(), p_os, 'Recebimento desfeito');
end $$;

-- ---------- 4. O.S. finalizada não pode ser excluída ----------
create or replace function public.tg_os_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'finalizado' then
    raise exception 'O.S. finalizada não pode ser excluída: o recebimento dela está no Financeiro. Desfaça o recebimento antes.' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger service_orders_delete_guard before delete on public.service_orders
  for each row execute function public.tg_os_delete_guard();

-- ---------- 7. permissões e search_path ----------
alter function public.tg_profiles_guard() set search_path = public;
alter function public.brl(numeric) set search_path = public;
alter function public.is_master() set search_path = public;
alter function public.is_fin() set search_path = public;
alter function public.status_label(text) set search_path = public;
alter function public.tg_purchase_defaults() set search_path = public;
alter function public.tg_products_stock_guard() set search_path = public;

-- Rodar no SQL Editor do Supabase (o conector não executa revoke)
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.check_discount_password(uuid, text) from authenticated;
revoke execute on function public.discount_password_ok(uuid, text) from authenticated;
revoke execute on function public.portal_get(text, text) from authenticated;
revoke execute on function public.portal_decide_quote(text, text, text) from authenticated;
