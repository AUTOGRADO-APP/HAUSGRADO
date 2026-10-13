-- Testes das regras do banco (RLS, pagamento, desconto, compras, comissões, portal).
-- Rodar SÓ no banco LOCAL (supabase start → supabase db reset), nunca na produção: cria usuários de teste.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/regras_test.sql
-- Resultado esperado: linhas T1..T23 conforme o texto de cada uma; os ERROR são esperados (bloqueios funcionando).

\set ON_ERROR_STOP 0
insert into auth.users values ('11111111-1111-4111-8111-111111111111','master@x'),('22222222-2222-4222-8222-222222222222','admin@x'),('33333333-3333-4333-8333-333333333333','atend@x'),('44444444-4444-4444-8444-444444444444','outro@x');
insert into public.shops (id,name) values ('00000000-0000-4000-8000-000000000002','Outra');
insert into public.profiles values
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','Master','master','master',true,now()),
 ('22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000001','Admin','admin','admin',true,now()),
 ('33333333-3333-4333-8333-333333333333','00000000-0000-4000-8000-000000000001','Atendente','atendente','atendente',true,now()),
 ('44444444-4444-4444-8444-444444444444','00000000-0000-4000-8000-000000000002','Outro','outro','master',true,now());
insert into public.customers (shop_id,name,phone) values ('00000000-0000-4000-8000-000000000002','Secreto','61900000000');

-- ===== ATENDENTE =====
set role authenticated; set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select 'T1 atend vê OS (3)' t, count(*) from service_orders;
select 'T2 atend clientes (3, sem outra oficina)' t, count(*) from customers;
select 'T3 atend despesas (0)' t, count(*) from expenses;
select 'T4 atend comissões (0)' t, count(*) from v_commissions;
update service_orders set status='finalizado' where number=1003;  -- deve falhar
select 'T5 status OS 1003 continua entrega' t, status from service_orders where number=1003;
update quotes set discount=10 where number=501; -- deve falhar
select apply_quote_discount('00000000-0000-4000-8000-0000000000f1', 50, 'errada'); -- deve falhar
select apply_quote_discount('00000000-0000-4000-8000-0000000000f1', 50, '1234');
select 'T6 total orç 501 (1129.60-50=1079.60)' t, quote_total('00000000-0000-4000-8000-0000000000f1');
select register_receipt('00000000-0000-4000-8000-0000000000e3', '[{"method":"pix","amount":300}]', null); -- falta 50 → falha
select 'T7 atend registra com senha' t, register_receipt('00000000-0000-4000-8000-0000000000e3', '[{"method":"pix","amount":100},{"method":"credito","amount":200,"installments":3}]', '1234') is not null;
select 'T8 os_is_paid' t, os_is_paid('00000000-0000-4000-8000-0000000000e3');
select 'T9 atend não vê receipts (0)' t, count(*) from receipts;
insert into expenses (category,amount,due_date) values ('Água',10,current_date); -- falha
select set_discount_password('9999'); -- falha (não master)
select check_discount_password('00000000-0000-4000-8000-000000000001','1234'); -- sem permissão
select portal_get('x','1'); -- sem permissão
insert into storage.objects (bucket_id,name) values ('os-media','00000000-0000-4000-8000-000000000001/os/a.jpg');
insert into storage.objects (bucket_id,name) values ('os-media','00000000-0000-4000-8000-000000000002/os/a.jpg'); -- falha
update service_orders set status='entrega' where number=1003; -- falha (sair de finalizado)
reset role;

-- ===== ADMIN =====
set role authenticated; set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select 'T10 admin vê despesa de taxa' t, category, amount, description from expenses;
select 'T11 receipt' t, total, difference, discount_authorized from receipts;
select method, installments, fee_pct from receipt_payments;
insert into purchases (supplier_id, purchased_on, payment_method, due_date, invoice_number) select id, current_date, 'boleto', current_date+10, '777' from suppliers limit 1;
insert into purchase_items (purchase_id, description, qty, unit_cost) select id, 'Filtros', 10, 14 from purchases;
update purchases set freight = 25;
select 'T12 despesa compra (165, não paga)' t, amount, paid, due_date - current_date dias from expenses where source='purchase';
update expenses set paid=true, paid_on=current_date where source='purchase';
select 'T13 compra paga' t, paid from purchases;
insert into commission_payments (service_order_id) values ('00000000-0000-4000-8000-0000000000e3');
select 'T14 comissão (5% de 350=17.50)' t, amount, description from expenses where source='commission';
select 'T15 v_commissions' t, number, commission, paid_at is not null from v_commissions;
select undo_receipt('00000000-0000-4000-8000-0000000000e3');
select 'T16 após desfazer' t, status, (select count(*) from receipts), (select count(*) from expenses where source='fee') from service_orders where number=1003;
reset role;

-- ===== MASTER =====
set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select set_discount_password('abcd');
select 'T17 status senha' t, discount_password_status()->>'active';
update profiles set role='admin' where username='master'; -- falha (próprio)
reset role;

-- ===== OUTRA OFICINA =====
set role authenticated; set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select 'T18 outra oficina vê OS (0)' t, count(*) from service_orders;
select 'T19 outra vê clientes (1)' t, count(*) from customers;
reset role;

-- ===== PORTAL (service_role) =====
set role service_role;
select 'T20 portal fone errado' t, portal_get(portal_token, '000') from service_orders where number=1001;
select 'T21 tentativas gravadas (1)' t, count(*) from portal_attempts where not ok;
select 'T22 portal ok' t, (portal_get(portal_token, '+55 (61) 99123-4567'))->'quote'->>'total' from service_orders where number=1001;
select portal_decide_quote(portal_token, '61991234567', 'aprovado') from service_orders where number=1001;
select 'T23 OS 1001 aprovada pelo cliente' t, status from service_orders where number=1001;
select text from service_order_history where service_order_id='00000000-0000-4000-8000-0000000000e1' order by id;
reset role;
