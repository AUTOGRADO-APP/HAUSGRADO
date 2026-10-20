-- =====================================================================
-- Fotos de entrada: estepe e nível do óleo (pedido do Vinícius em 2026-10-20)
--   'estepe' é a 7ª foto da Nova O.S.; 'oleo' é tirada dentro da O.S.
--   (Serviço e Garantia, após 10 min do carro parado) e sai junto
--   com as fotos de entrada na pasta do cliente.
--   O segredo de roda fica em service_orders.checklist (jsonb), sem mudar o banco.
-- =====================================================================
alter table public.service_order_photos drop constraint if exists service_order_photos_position_check;
alter table public.service_order_photos add constraint service_order_photos_position_check
  check (position in ('frontal','lat_esq','lat_dir','traseira','motor','painel','estepe','oleo'));
