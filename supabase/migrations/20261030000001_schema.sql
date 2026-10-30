-- =============================================================================
-- Petrosupply Financeiro — Migration 01: esquema, RLS, auditoria
-- Executar no SQL Editor do Supabase (ou via `supabase db push`).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Funções utilitárias
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Data "de hoje" no fuso de Brasília (usada para calcular status de parcelas)
create or replace function public.brazil_today()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- -----------------------------------------------------------------------------
-- profiles: usuários do sistema (1:1 com auth.users)
-- O primeiro usuário cadastrado vira administrador ativo. Os demais entram
-- inativos e precisam ser liberados por um administrador (Configurações).
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  role        text not null default 'user' check (role in ('admin', 'user')),
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when is_first then 'admin' else 'user' end,
    is_first
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers de autorização (security definer evita recursão de RLS em profiles)
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin')
$$;

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  cnpj        text not null check (cnpj ~ '^[0-9]{14}$'),   -- somente dígitos
  email       text,
  phone       text,
  notes       text,
  is_demo     boolean not null default false,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint clients_cnpj_unique unique (cnpj)
);

create trigger trg_clients_updated before update on public.clients
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- payment_conditions: condições de pagamento reutilizáveis
-- items = [{ "label": "Sinal", "percent": 50, "offset_days": 0 }, ...]
-- offset_days é contado a partir do vencimento do sinal (1ª parcela).
-- -----------------------------------------------------------------------------
create table public.payment_conditions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  items       jsonb not null,
  is_default  boolean not null default false,   -- condições originais do sistema
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint payment_conditions_items_array check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) >= 1)
);

create trigger trg_payment_conditions_updated before update on public.payment_conditions
  for each row execute function public.set_updated_at();

-- Garante que os percentuais somam exatamente 100%
create or replace function public.validate_payment_condition()
returns trigger language plpgsql as $$
declare
  total numeric;
begin
  select coalesce(sum((item ->> 'percent')::numeric), 0)
    into total
    from jsonb_array_elements(new.items) as item;
  if round(total, 4) <> 100 then
    raise exception 'A soma dos percentuais da condição de pagamento deve ser 100%% (atual: % %%)', total;
  end if;
  return new;
end $$;

create trigger trg_payment_conditions_validate
  before insert or update of items on public.payment_conditions
  for each row execute function public.validate_payment_condition();

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients (id) on delete restrict,
  project_type          text not null check (project_type in (
                          'CRC Petrobras', 'Consultoria CRC', 'Assessoria CRC',
                          'Treinamento', 'Cadastros Corporativos', 'Suporte Pontual')),
  start_date            date not null,
  total_value           numeric(14, 2) not null check (total_value > 0),
  first_due_date        date not null,
  payment_condition_id  uuid references public.payment_conditions (id) on delete set null,
  status                text not null default 'ativo' check (status in ('ativo', 'concluido', 'cancelado')),
  notes                 text,
  is_demo               boolean not null default false,
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_projects_client on public.projects (client_id);

create trigger trg_projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- installments: parcelas do cronograma
-- -----------------------------------------------------------------------------
create table public.installments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  number       integer not null check (number >= 1),
  label        text not null,
  percent      numeric(7, 4) not null check (percent >= 0 and percent <= 100),
  amount       numeric(14, 2) not null check (amount >= 0),
  due_date     date not null,
  canceled_at  timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint installments_unique_number unique (project_id, number)   -- sem duplicidade de parcelas
);

create index idx_installments_project on public.installments (project_id);
create index idx_installments_due on public.installments (due_date);

create trigger trg_installments_updated before update on public.installments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- payments: recebimentos (uma parcela pode ter vários, para pagamentos parciais)
-- Parcelas com pagamentos não podem ser apagadas (histórico financeiro preservado)
-- -----------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  installment_id  uuid not null references public.installments (id) on delete restrict,
  amount          numeric(14, 2) not null check (amount > 0),
  paid_at         date not null,
  notes           text,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_payments_installment on public.payments (installment_id);
create index idx_payments_paid_at on public.payments (paid_at);

-- -----------------------------------------------------------------------------
-- audit_log: histórico de alterações (preenchido apenas por trigger)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   uuid,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

create index idx_audit_record on public.audit_log (table_name, record_id);
create index idx_audit_changed_at on public.audit_log (changed_at desc);

create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'))::uuid,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

create trigger trg_audit_clients      after insert or update or delete on public.clients      for each row execute function public.log_audit();
create trigger trg_audit_projects     after insert or update or delete on public.projects     for each row execute function public.log_audit();
create trigger trg_audit_installments after insert or update or delete on public.installments for each row execute function public.log_audit();
create trigger trg_audit_payments     after insert or update or delete on public.payments     for each row execute function public.log_audit();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Todas as tabelas exigem usuário autenticado E ativo. Sem acesso anônimo.
-- -----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.clients             enable row level security;
alter table public.payment_conditions  enable row level security;
alter table public.projects            enable row level security;
alter table public.installments        enable row level security;
alter table public.payments            enable row level security;
alter table public.audit_log           enable row level security;

-- profiles: cada um lê o próprio perfil; admin lê e altera todos
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tabelas de negócio: acesso total para usuários ativos
create policy clients_all on public.clients for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy projects_all on public.projects for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy installments_all on public.installments for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy payments_all on public.payments for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- Condições de pagamento: todos leem; só admin altera
create policy payment_conditions_select on public.payment_conditions for select to authenticated
  using (public.is_active_user());
create policy payment_conditions_write on public.payment_conditions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit_log: somente leitura para usuários ativos (gravação só via trigger)
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_active_user());

-- Privilégios: nada para anon; authenticated conforme as policies acima
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.clients, public.projects, public.installments,
  public.payments, public.payment_conditions to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.audit_log to authenticated;
