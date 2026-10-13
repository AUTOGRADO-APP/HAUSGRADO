-- =====================================================================
-- Hausgrado · dados iniciais da versão beta
-- Roda como postgres (ignora RLS). Os usuários de login são criados à parte:
--   node scripts/create-demo-users.mjs
-- =====================================================================

-- Oficina (id fixo para facilitar scripts e testes)
insert into public.shops (id, name, phone)
values ('00000000-0000-4000-8000-000000000001', 'Autogrado', '61999990000')
on conflict (id) do nothing;

-- Senha de autorização de desconto da demo: 1234 (troque em Configurações antes de usar de verdade)
insert into public.shop_secrets (shop_id, discount_password_hash, discount_password_set_at)
values ('00000000-0000-4000-8000-000000000001', extensions.crypt('1234', extensions.gen_salt('bf')), now())
on conflict (shop_id) do nothing;

-- Mecânicos
insert into public.technicians (id, shop_id, name) values
 ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Arthur Chagas'),
 ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Iago Martins')
on conflict (id) do nothing;

-- Serviços prontos (catálogo)
insert into public.service_catalog (shop_id, name, description, price) values
 ('00000000-0000-4000-8000-000000000001', 'Check list viagem', 'Inspeção de 40 itens: freios, pneus, suspensão, fluidos, iluminação, bateria e arrefecimento.', 350.00),
 ('00000000-0000-4000-8000-000000000001', 'Alinhamento e balanceamento', 'Alinhamento computadorizado + balanceamento das 4 rodas.', 160.00),
 ('00000000-0000-4000-8000-000000000001', 'Revisão 60 mil km · Renault Kwid', 'Troca de óleo e filtros, velas, fluido de freio, inspeção de correias e suspensão.', 890.00),
 ('00000000-0000-4000-8000-000000000001', 'Troca de óleo e filtro', 'Mão de obra de troca de óleo do motor e filtro de óleo.', 80.00),
 ('00000000-0000-4000-8000-000000000001', 'Higienização do ar-condicionado', 'Limpeza do evaporador e troca do filtro de cabine.', 180.00)
on conflict do nothing;

-- Produtos
insert into public.products (shop_id, name, manufacturer, sku, cost, price, category, viscosity, api, volume, application_spec, application_brands, additive_type) values
 ('00000000-0000-4000-8000-000000000001', 'Óleo 5W30 sintético 1L', 'Mobil', 'OLM-5W30-1', 32.00, 59.90, 'oleo_motor', '5W30', 'SP', '1L', 'ACEA C3', '{}', null),
 ('00000000-0000-4000-8000-000000000001', 'Óleo 0W20 sintético 1L', 'Shell', 'OLM-0W20-1', 38.00, 69.90, 'oleo_motor', '0W20', 'SP', '1L', 'Dexos1 Gen3', '{}', null),
 ('00000000-0000-4000-8000-000000000001', 'Óleo câmbio automático ATF 1L', 'Motul', 'OLT-ATF-1', 45.00, 89.90, 'oleo_trans', null, null, null, 'Dexron VI', '{}', null),
 ('00000000-0000-4000-8000-000000000001', 'Filtro de óleo', 'Tecfil', 'FIL-PSL55', 14.00, 34.90, 'filtros', null, null, null, null, '{Volkswagen,Fiat}', null),
 ('00000000-0000-4000-8000-000000000001', 'Filtro de ar do motor', 'Mann', 'FIL-C2433', 22.00, 54.90, 'filtros', null, null, null, null, '{Renault,Nissan}', null),
 ('00000000-0000-4000-8000-000000000001', 'Pastilha de freio dianteira', 'Cobreq', 'PEC-N1452', 68.00, 149.90, 'peca', null, null, null, null, '{Chevrolet}', null),
 ('00000000-0000-4000-8000-000000000001', 'Aditivo de radiador 1L', 'Paraflu', 'ADT-RAD-1', 18.00, 39.90, 'aditivos', null, null, null, null, '{}', 'Arrefecimento')
on conflict do nothing;

-- Fornecedores
insert into public.suppliers (shop_id, name, salesperson, salesperson_phone, pix_key) values
 ('00000000-0000-4000-8000-000000000001', 'Distribuidora Planalto Peças', 'Marcos', '61988887777', '12.345.678/0001-90'),
 ('00000000-0000-4000-8000-000000000001', 'Lubrificantes Centro-Oeste', 'Juliana', '61977776666', 'financeiro@lubco.com.br')
on conflict do nothing;

-- Clientes e veículos de exemplo (DDD 61, um 62)
insert into public.customers (id, shop_id, name, phone, zip_code) values
 ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'Mariana Souza', '61991234567', '70040010'),
 ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000001', 'Ricardo Almeida', '61998765432', '71930000'),
 ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000001', 'Fernanda Lima', '62991112233', '74000000')
on conflict (id) do nothing;

insert into public.vehicles (id, shop_id, customer_id, plate, make, model, year, color, fuel) values
 ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'PAB1C23', 'Renault', 'Kwid Zen 1.0', '2021/2022', 'Branco', 'Flex'),
 ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'JKL4D56', 'Volkswagen', 'Polo 1.0 TSI', '2020/2020', 'Prata', 'Flex'),
 ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 'OGA7E89', 'Chevrolet', 'Onix LT', '2019/2020', 'Cinza', 'Flex')
on conflict (id) do nothing;

-- Três O.S. no quadro (status diferentes) com orçamento
insert into public.service_orders (id, shop_id, vehicle_id, customer_id, plate, make, model, year, color, fuel, km, fuel_level, entry_type, status, technician_id, customer_complaint) values
 ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'PAB1C23', 'Renault', 'Kwid Zen 1.0', '2021/2022', 'Branco', 'Flex', '60120', '1/2', 'manutencao', 'orcamento', '00000000-0000-4000-8000-0000000000a1', 'Revisão dos 60 mil km'),
 ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c2', 'JKL4D56', 'Volkswagen', 'Polo 1.0 TSI', '2020/2020', 'Prata', 'Flex', '48300', '1/4', 'servico', 'servico', '00000000-0000-4000-8000-0000000000a2', 'Barulho ao frear'),
 ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c3', 'OGA7E89', 'Chevrolet', 'Onix LT', '2019/2020', 'Cinza', 'Flex', '71050', '3/4', 'servico', 'entrega', '00000000-0000-4000-8000-0000000000a1', 'Vai viajar, quer check list')
on conflict (id) do nothing;

insert into public.quotes (id, shop_id, service_order_id, customer_id, plate, status) values
 ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'PAB1C23', 'enviado'),
 ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2', 'JKL4D56', 'aprovado'),
 ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c3', 'OGA7E89', 'aprovado')
on conflict (id) do nothing;

insert into public.quote_items (shop_id, quote_id, kind, description, details, qty, unit_price, position) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f1', 'mao', 'Revisão 60 mil km · Renault Kwid', 'Troca de óleo e filtros, velas, fluido de freio, inspeção de correias e suspensão.', 1, 890.00, 0),
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f1', 'peca', 'Óleo 5W30 sintético 1L', null, 4, 59.90, 1),
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f2', 'peca', 'Pastilha de freio dianteira', null, 1, 149.90, 0),
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f2', 'mao', 'Troca de pastilhas', null, 1, 120.00, 1),
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f3', 'mao', 'Check list viagem', 'Inspeção de 40 itens: freios, pneus, suspensão, fluidos, iluminação, bateria e arrefecimento.', 1, 350.00, 0);
