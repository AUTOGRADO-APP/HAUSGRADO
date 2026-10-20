-- =====================================================================
-- Mecânico não vê o contato do cliente (pedido do Vinícius em 2026-10-20)
--   Telefone, CPF/CNPJ e CEP ficam só com master, admin e atendente.
--   O mecânico continua vendo o NOME do cliente (O.S., Quadro, Histórico, Calendário)
--   pela visão customer_names, e continua cadastrando cliente na Nova O.S.
--   (o insert não depende de ler a tabela de volta).
-- =====================================================================

-- clientes: leitura só escritório
drop policy if exists customers_sel on public.customers;
create policy customers_sel on public.customers for select to authenticated
  using (shop_id = public.current_shop_id() and public.is_office());

-- só id e nome, para todos os perfis da oficina (dona da visão = postgres, então passa pela RLS
-- de customers; o filtro da oficina é feito aqui)
create or replace view public.customer_names as
select id, shop_id, name from public.customers where shop_id = public.current_shop_id();
revoke all on public.customer_names from public, anon;
grant select on public.customer_names to authenticated, service_role;

-- Quadro: o nome vem de customer_names (o mecânico continua vendo todos os cartões);
-- o telefone só aparece para quem lê customers (escritório)
create or replace view public.v_board with (security_invoker = true) as
select o.id, o.shop_id, o.number, o.plate, o.make, o.model, o.status, o.entry_type, o.entered_at, o.exited_at,
       o.customer_id, n.name as customer_name, c.phone as customer_phone,
       o.technician_id, t.name as technician_name,
       public.os_total(o.id) as total,
       coalesce((select max(h.created_at) from public.service_order_history h
                  where h.service_order_id = o.id and h.text like 'Status:%'), o.entered_at) as status_since,
       o.portal_token
  from public.service_orders o
  join public.customer_names n on n.id = o.customer_id
  left join public.customers c on c.id = o.customer_id
  left join public.technicians t on t.id = o.technician_id
 where o.status <> 'finalizado' or o.exited_at > now() - interval '3 days';
