-- =====================================================================
-- Hausgrado · visões para as telas (herdam o RLS: security_invoker)
-- =====================================================================

-- Quadro de serviço: um registro por O.S. com o que o cartão precisa
create or replace view public.v_board with (security_invoker = true) as
select o.id, o.shop_id, o.number, o.plate, o.make, o.model, o.status, o.entry_type, o.entered_at, o.exited_at,
       o.customer_id, c.name as customer_name, c.phone as customer_phone,
       o.technician_id, t.name as technician_name,
       public.os_total(o.id) as total,
       coalesce((select max(h.created_at) from public.service_order_history h
                  where h.service_order_id = o.id and h.text like 'Status:%'), o.entered_at) as status_since,
       o.portal_token
  from public.service_orders o
  join public.customers c on c.id = o.customer_id
  left join public.technicians t on t.id = o.technician_id
 where o.status <> 'finalizado' or o.exited_at > now() - interval '3 days';
