-- Testes das regras do banco (RLS, pagamento, desconto, compras, comissões, portal).
-- Rodar SÓ no banco LOCAL (supabase start → supabase db reset), nunca na produção: cria usuários de teste.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/regras_test.sql
-- Resultado esperado: linhas T1..T44 conforme o texto de cada uma; os ERROR são esperados (bloqueios funcionando).

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
select apply_quote_discount('00000000-0000-4000-8000-0000000000f1', 50, '1234'); -- deve falhar (senha ainda não conferida)
select 'T35 conferência da senha' t, verify_discount_password('1234');
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
select 'T24 histórico com as formas (Pix R$ 100,00 + Cartão de crédito 3x R$ 200,00)' t, text from service_order_history where text like 'Pagamento recebido:%';
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

-- ===== ESTOQUE (migration 20261015000000_stock) =====
set role authenticated; set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
update products set stock_qty = 50 where sku is not null; -- falha (só por movimentação)
insert into stock_movements (shop_id, product_id, qty, kind) select shop_id, id, 5, 'ajuste' from products limit 1; -- falha (RLS)
select adjust_stock((select id from products order by name limit 1), 4, 'Inventário'); -- falha (balanço desligado)
select 'T42 balanço com senha errada (null)' t, start_stock_count('errada');
select 'T43 balanço ativo por 60 min (t)' t, start_stock_count('1234') between now() + interval '59 minutes' and now() + interval '61 minutes';
select 'T25 atend ajusta inventário (+4 → 4)' t, adjust_stock((select id from products order by name limit 1), 4, 'Inventário');
select adjust_stock((select id from products order by name limit 1), 2, ''); -- falha (sem motivo)
select end_stock_count();
select 'T44 balanço encerrado (null)' t, stock_count_until();
select adjust_stock((select id from products order by name limit 1), 1, 'Inventário'); -- falha (balanço encerrado)
update products set ncm = '1234' where sku is not null; -- falha (NCM com 8 dígitos)
reset role;

set role authenticated; set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into purchases (supplier_id, purchased_on, payment_method, invoice_number) select id, current_date, 'pix', 'EST1' from suppliers limit 1;
insert into purchase_items (purchase_id, description, qty, unit_cost, product_id, position)
  select (select id from purchases where invoice_number='EST1'), name, 6, 33.33, id, 0 from products order by name limit 1;
insert into purchase_items (purchase_id, description, qty, unit_cost, position)
  select id, 'Peça avulsa sem cadastro', 9, 10, 1 from purchases where invoice_number='EST1';
select 'T26 compra não recebida: estoque 4, a caminho 6' t, p.stock_qty, x.incoming
  from products p join product_stock_extra() x on x.product_id = p.id where p.id = (select id from products order by name limit 1);
update purchases set received_on = current_date where invoice_number='EST1';
select 'T27 recebida: estoque 10 (avulso não entra), custo 33.33' t, stock_qty, cost from products order by name limit 1;
select 'T28 nenhum produto novo cadastrado pelo avulso' t, count(*) from products where name like 'Peça avulsa%';
update purchase_items set qty = 8 where product_id is not null and purchase_id = (select id from purchases where invoice_number='EST1');
select 'T29 editar qtd da compra recebida: estoque 12' t, stock_qty from products order by name limit 1;
insert into quote_items (quote_id, kind, description, qty, unit_price, product_id)
  select '00000000-0000-4000-8000-0000000000f2', 'peca', name, 3, price, id from products order by name limit 1; -- falha (aprovado travado)
update quotes set status = 'rascunho' where id = '00000000-0000-4000-8000-0000000000f2';
insert into quote_items (quote_id, kind, description, qty, unit_price, product_id)
  select '00000000-0000-4000-8000-0000000000f2', 'peca', name, 3, price, id from products order by name limit 1;
update quotes set status = 'aprovado' where id = '00000000-0000-4000-8000-0000000000f2';
select 'T30 reservado 3 (orç aprovado, O.S. no pátio)' t, x.reserved from product_stock_extra() x where x.product_id = (select id from products order by name limit 1);
select register_receipt('00000000-0000-4000-8000-0000000000e2', jsonb_build_array(jsonb_build_object('method','pix','amount', os_total('00000000-0000-4000-8000-0000000000e2'))), null) is not null;
select 'T31 finalizou: estoque 9, reservado some' t, p.stock_qty, (select count(*) from product_stock_extra() x where x.product_id = p.id and x.reserved > 0) from products p order by name limit 1;
select undo_receipt('00000000-0000-4000-8000-0000000000e2', 'servico');
select 'T32 desfez: estoque 12' t, stock_qty from products order by name limit 1;
delete from purchases where invoice_number='EST1';
select 'T33 compra excluída: estoque 4' t, stock_qty from products order by name limit 1;
select 'T34 movimentos (só o ajuste)' t, kind, qty, reason, created_by_name from stock_movements;
reset role;

-- ===== REVISÃO 15/10 (migration 20261015120000_review_fixes) =====
set role authenticated; set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
insert into quotes (service_order_id, customer_id, plate, status) values ('00000000-0000-4000-8000-0000000000e2','00000000-0000-4000-8000-0000000000c2','JKL4D56','rascunho'); -- falha (já tem orçamento)
select 'T36 total da O.S. 1002 continua o do aprovado (>0)' t, os_total('00000000-0000-4000-8000-0000000000e2') > 0;
update quote_items set unit_price = 1 where quote_id = '00000000-0000-4000-8000-0000000000f2'; -- falha (aprovado travado)
select register_receipt('00000000-0000-4000-8000-0000000000e2', '[{"method":"pix","amount":1000},{"method":"dinheiro","amount":-1}]', null); -- falha (negativo)
select register_receipt('00000000-0000-4000-8000-0000000000e2', '[{"method":"credito","amount":1000,"installments":13}]', null); -- falha (parcelas)
select register_receipt('00000000-0000-4000-8000-0000000000e2', jsonb_build_array(jsonb_build_object('method','pix','amount', os_total('00000000-0000-4000-8000-0000000000e2'))), null) is not null;
update quotes set status = 'rascunho' where id = '00000000-0000-4000-8000-0000000000f2'; -- falha (O.S. finalizada)
delete from quote_items where quote_id = '00000000-0000-4000-8000-0000000000f2'; -- falha (O.S. finalizada)
reset role;
set role authenticated; set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
delete from service_orders where id = '00000000-0000-4000-8000-0000000000e2'; -- falha (finalizada)
select 'T37 O.S. finalizada continua' t, count(*) from service_orders where id = '00000000-0000-4000-8000-0000000000e2';
select undo_receipt('00000000-0000-4000-8000-0000000000e1', 'orcamento'); -- falha (não finalizada)
select 'T38 desconto maior que os itens' t;
update quotes set status = 'rascunho' where id = '00000000-0000-4000-8000-0000000000f1';
delete from quote_items where quote_id = '00000000-0000-4000-8000-0000000000f1' and kind = 'mao'; -- ok (itens 239,60 ≥ desconto 50)
update quote_items set unit_price = 1 where quote_id = '00000000-0000-4000-8000-0000000000f1'; -- falha (desconto 50 > 4,00)
select 'T38 total nunca negativo' t, quote_total('00000000-0000-4000-8000-0000000000f1') >= 0;
reset role;

-- ===== METAS (T39–T41) =====
set role authenticated; set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select 'T39 atend não vê metas (0)' t, count(*) from revenue_goals;
insert into revenue_goals (month, goal, super_goal) values ('2030-01-01', 100, 200); -- falha (atendente)
reset role;
set role authenticated; set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into revenue_goals (month, goal, super_goal) values ('2030-01-01', 100, 200);
insert into revenue_goals (month, goal, super_goal) values ('2030-02-01', 300, 200); -- falha (super < meta)
insert into revenue_goals (month, goal, super_goal) values ('2030-03-15', 100, 200); -- falha (não é dia 1)
select 'T40 admin cria meta (1 de 2030)' t, count(*) from revenue_goals where month >= '2030-01-01';
reset role;
set role authenticated; set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select 'T41 outra oficina não vê (0)' t, count(*) from revenue_goals where month >= '2030-01-01';
reset role;
