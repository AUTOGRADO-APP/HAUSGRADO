-- =====================================================================
-- Hausgrado · esquema do banco (Supabase / Postgres)
-- Convenções: tabelas e colunas em inglês (snake_case); textos de UI em pt-BR.
-- Toda tabela tem shop_id (multi-oficina desde já) e created_at.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Oficina e configurações
-- ---------------------------------------------------------------------
create table public.shops (
  id                uuid primary key default gen_random_uuid(),
  name              text not null default 'Autogrado',
  phone             text,
  portal_base_url   text,
  commission_pct    numeric(5,2) not null default 5,
  fee_debit_pct     numeric(5,2) not null default 1.39,
  fee_pix_pct       numeric(5,2) not null default 0.99,
  -- índice 1..12 = taxa do crédito em Nx
  fee_credit_pct    numeric(5,2)[] not null default array[3.19,4.59,5.29,5.99,6.69,7.39,8.09,8.79,9.49,10.19,10.89,11.59]::numeric(5,2)[],
  plate_api_provider text,
  os_seq            integer not null default 1000,
  quote_seq         integer not null default 500,
  created_at        timestamptz not null default now()
);

-- Segredos da oficina: sem nenhuma policy (só funções security definer leem)
create table public.shop_secrets (
  shop_id                    uuid primary key references public.shops(id) on delete cascade,
  discount_password_hash     text,
  discount_password_set_at   timestamptz,
  discount_password_set_by   uuid
);

-- ---------------------------------------------------------------------
-- Usuários (1:1 com auth.users) e equipe
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  shop_id     uuid not null references public.shops(id),
  full_name   text not null,
  username    text not null unique check (username ~ '^[a-z0-9._-]{3,}$'),
  role        text not null check (role in ('master','admin','atendente')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Funções auxiliares usadas nas regras de acesso (RLS)
create or replace function public.current_shop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select shop_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_fin() returns boolean
language sql stable as $$ select coalesce(public.current_app_role() in ('master','admin'), false) $$;

create or replace function public.is_master() returns boolean
language sql stable as $$ select coalesce(public.current_app_role() = 'master', false) $$;

create or replace function public.current_user_name() returns text
language sql stable security definer set search_path = public as $$
  select full_name from public.profiles where id = auth.uid()
$$;

create table public.technicians (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null default public.current_shop_id() references public.shops(id),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Clientes e veículos
-- ---------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null default public.current_shop_id() references public.shops(id),
  name        text not null,
  phone       text not null check (phone ~ '^[0-9]{10,11}$'),   -- só dígitos, com DDD
  document    text,                                              -- CPF/CNPJ
  zip_code    text check (zip_code is null or zip_code ~ '^[0-9]{8}$'),
  created_at  timestamptz not null default now()
);
create index on public.customers (shop_id, name);
create index on public.customers (shop_id, phone);

create table public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null default public.current_shop_id() references public.shops(id),
  customer_id  uuid references public.customers(id) on delete set null,
  plate        text not null check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  make text, model text, year text, color text, fuel text,
  created_at   timestamptz not null default now(),
  unique (shop_id, plate)
);

create table public.plate_cache (
  plate       text primary key,
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------
create table public.appointments (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null default public.current_shop_id() references public.shops(id),
  date              date not null,
  time              time not null,
  customer_id       uuid not null references public.customers(id),
  plate             text,
  reason            text,
  status            text not null default 'agendado' check (status in ('agendado','atendido','faltou')),
  service_order_id  uuid,
  reminder_sent_at  timestamptz,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);
create index on public.appointments (shop_id, date);

-- ---------------------------------------------------------------------
-- Ordens de serviço
-- ---------------------------------------------------------------------
create table public.service_orders (
  id                   uuid primary key default gen_random_uuid(),
  shop_id              uuid not null default public.current_shop_id() references public.shops(id),
  number               integer,                       -- preenchido por trigger (sequencial por oficina)
  vehicle_id           uuid references public.vehicles(id),
  customer_id          uuid not null references public.customers(id),
  plate text not null, make text, model text, year text, color text, fuel text,   -- snapshot da entrada
  km                   text,
  fuel_level           text check (fuel_level in ('Reserva','1/4','1/2','3/4','Cheio')),
  entry_type           text not null check (entry_type in ('servico','manutencao','garantia')),
  status               text not null default 'orcamento' check (status in ('orcamento','aprovado','pecas','servico','entrega','finalizado')),
  entered_at           timestamptz not null default now(),
  exited_at            timestamptz,
  technician_id        uuid references public.technicians(id),
  customer_complaint   text,
  service_description  text,
  checklist            jsonb not null default '{}'::jsonb,
  portal_token         text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  appointment_id       uuid references public.appointments(id),
  created_at           timestamptz not null default now(),
  unique (shop_id, number)
);
create index on public.service_orders (shop_id, status);
create index on public.service_orders (shop_id, exited_at);
alter table public.appointments add constraint appointments_os_fk foreign key (service_order_id) references public.service_orders(id) on delete set null;

create table public.service_order_photos (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null default public.current_shop_id() references public.shops(id),
  service_order_id  uuid not null references public.service_orders(id) on delete cascade,
  position          text not null check (position in ('frontal','lat_esq','lat_dir','traseira','motor','painel')),
  storage_path      text not null,
  created_at        timestamptz not null default now(),
  unique (service_order_id, position)
);

create table public.service_order_records (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null default public.current_shop_id() references public.shops(id),
  service_order_id  uuid not null references public.service_orders(id) on delete cascade,
  tab               text not null check (tab in ('avarias','pecas','servicos')),
  storage_path      text,          -- null = registro só com texto
  mime              text,
  file_name         text,
  description       text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);
create index on public.service_order_records (service_order_id, tab);

create table public.service_order_history (
  id                bigint generated always as identity primary key,
  shop_id           uuid not null default public.current_shop_id() references public.shops(id),
  service_order_id  uuid not null references public.service_orders(id) on delete cascade,
  text              text not null,
  created_by        uuid default auth.uid(),
  created_by_name   text default public.current_user_name(),
  created_at        timestamptz not null default now()
);
create index on public.service_order_history (service_order_id, created_at);

-- ---------------------------------------------------------------------
-- Catálogos: produtos e serviços prontos
-- ---------------------------------------------------------------------
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null default public.current_shop_id() references public.shops(id),
  name                text not null,
  manufacturer        text,
  sku                 text,
  ean                 text check (ean is null or ean ~ '^([0-9]{8}|[0-9]{13})$'),
  cost                numeric(12,2) not null default 0,
  price               numeric(12,2) not null check (price > 0),
  category            text not null check (category in ('oleo_motor','oleo_trans','peca','filtros','aditivos')),
  viscosity           text check (viscosity is null or viscosity in ('0W16','0W20','0W30','5W20','5W30','5W40','10W40','15W40','20W50','10W60')),
  api                 text check (api is null or api in ('SF','SJ','SL','SN','SP','SQ')),
  volume              text check (volume is null or volume in ('1L','4L','5L')),
  application_spec    text,
  application_brands  text[] not null default '{}',
  additive_type       text check (additive_type is null or additive_type in ('Combustível','Óleo','Transmissão','Direção','Arrefecimento')),
  created_at          timestamptz not null default now()
);
create unique index products_sku_uq on public.products (shop_id, sku) where sku is not null;

create table public.service_catalog (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null default public.current_shop_id() references public.shops(id),
  name         text not null,
  description  text,
  price        numeric(12,2) not null check (price > 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index service_catalog_name_uq on public.service_catalog (shop_id, lower(name));

-- ---------------------------------------------------------------------
-- Orçamentos
-- ---------------------------------------------------------------------
create table public.quotes (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null default public.current_shop_id() references public.shops(id),
  number            integer,                          -- trigger
  service_order_id  uuid references public.service_orders(id) on delete set null,
  customer_id       uuid references public.customers(id),
  plate             text,
  discount          numeric(12,2) not null default 0 check (discount >= 0),  -- só muda via apply_quote_discount()
  validity_days     integer not null default 7,
  status            text not null default 'rascunho' check (status in ('rascunho','enviado','aprovado','recusado')),
  decided_at        timestamptz,
  decided_by        text check (decided_by in ('oficina','cliente')),
  created_at        timestamptz not null default now(),
  unique (shop_id, number)
);

create table public.quote_items (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null default public.current_shop_id() references public.shops(id),
  quote_id     uuid not null references public.quotes(id) on delete cascade,
  kind         text not null check (kind in ('peca','mao')),
  description  text not null default '',
  details      text,                                       -- descrição do serviço do catálogo
  qty          numeric(10,2) not null default 1 check (qty > 0),
  unit_price   numeric(12,2) not null default 0 check (unit_price >= 0),
  product_id   uuid references public.products(id) on delete set null,
  service_id   uuid references public.service_catalog(id) on delete set null,
  sku          text,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index on public.quote_items (quote_id, position);

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create table public.receipts (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops(id),
  service_order_id  uuid not null unique references public.service_orders(id) on delete cascade,
  received_at       timestamptz not null default now(),
  total             numeric(12,2) not null,
  difference        numeric(12,2) not null default 0,   -- recebido − total da O.S. (negativo = desconto autorizado)
  discount_authorized boolean not null default false,
  received_by       uuid,
  created_at        timestamptz not null default now()
);

create table public.receipt_payments (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id),
  receipt_id    uuid not null references public.receipts(id) on delete cascade,
  method        text not null check (method in ('dinheiro','credito','debito','pix')),
  amount        numeric(12,2) not null check (amount > 0),
  installments  integer not null default 1 check (installments between 1 and 12),
  fee_pct       numeric(5,2) not null default 0
);

create table public.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null default public.current_shop_id() references public.shops(id),
  name               text not null,
  salesperson        text,
  salesperson_phone  text,
  pix_key            text,
  created_at         timestamptz not null default now()
);
create unique index suppliers_name_uq on public.suppliers (shop_id, lower(name));

create table public.purchases (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null default public.current_shop_id() references public.shops(id),
  supplier_id     uuid not null references public.suppliers(id),
  invoice_number  text,
  purchased_on    date not null,
  received_on     date,
  freight         numeric(12,2) not null default 0 check (freight >= 0),
  notes           text,
  payment_method  text not null check (payment_method in ('pix','boleto','debito','credito','dinheiro','transferencia')),
  payment_code    text,              -- código do boleto ou chave pix
  due_date        date,
  paid            boolean not null default false,
  paid_on         date,
  created_at      timestamptz not null default now(),
  check (payment_method <> 'boleto' or due_date is not null),
  check (received_on is null or received_on >= purchased_on)
);

create table public.purchase_items (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null default public.current_shop_id() references public.shops(id),
  purchase_id  uuid not null references public.purchases(id) on delete cascade,
  description  text not null,
  qty          numeric(10,2) not null default 1 check (qty > 0),
  unit_cost    numeric(12,2) not null default 0 check (unit_cost >= 0),
  product_id   uuid references public.products(id) on delete set null,
  sku          text,
  position     integer not null default 0
);

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null default public.current_shop_id() references public.shops(id),
  description       text,
  category          text not null check (category in ('Água','Aluguel','Antecipação de lucros','Compra de mercadorias','Contabilidade',
                       'Energia','Equipamentos','Estornos','Financeiro','Folha de pagamento','Comissão','Impostos','Internet',
                       'Prejuízos diversos','Reformas','Sistemas','Taxa de pagamento','Terceiros')),
  amount            numeric(12,2) not null check (amount > 0),
  due_date          date not null,
  payment_code      text,
  paid              boolean not null default false,
  paid_on           date,
  source            text not null default 'manual' check (source in ('manual','purchase','fee','commission')),
  purchase_id       uuid unique references public.purchases(id) on delete cascade,
  receipt_id        uuid unique references public.receipts(id) on delete cascade,
  service_order_id  uuid references public.service_orders(id) on delete cascade,
  created_at        timestamptz not null default now()
);
create index on public.expenses (shop_id, due_date);

create table public.commission_payments (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null default public.current_shop_id() references public.shops(id),
  service_order_id  uuid not null unique references public.service_orders(id) on delete cascade,
  paid_at           timestamptz not null default now(),
  paid_by           uuid default auth.uid()
);

-- Tentativas no portal do cliente (limite de tentativas)
create table public.portal_attempts (
  id          bigint generated always as identity primary key,
  token       text not null,
  ip          text,
  ok          boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.portal_attempts (token, created_at);
