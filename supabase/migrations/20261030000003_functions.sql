-- =============================================================================
-- Migration 03: funções (RPC) com regras de negócio atômicas
-- Todas rodam como o usuário autenticado (security invoker) e, portanto,
-- respeitam as políticas RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_project: cria projeto + parcelas em uma única transação.
-- p_installments = [{ "label": "Sinal", "percent": 50, "amount": 5000.00, "due_date": "2026-11-01" }, ...]
-- Regras: soma dos valores = valor do projeto; soma dos percentuais = 100%.
-- -----------------------------------------------------------------------------
create or replace function public.create_project(
  p_client_id            uuid,
  p_project_type         text,
  p_start_date           date,
  p_total_value          numeric,
  p_first_due_date       date,
  p_payment_condition_id uuid,
  p_notes                text,
  p_installments         jsonb
) returns uuid
language plpgsql as $$
declare
  v_id   uuid;
  v_sum  numeric;
  v_pct  numeric;
  r      record;
  n      integer := 0;
begin
  if not public.is_active_user() then
    raise exception 'Acesso negado';
  end if;
  if p_installments is null or jsonb_typeof(p_installments) <> 'array' or jsonb_array_length(p_installments) = 0 then
    raise exception 'Informe ao menos uma parcela';
  end if;

  select coalesce(sum((x ->> 'amount')::numeric), 0), coalesce(sum((x ->> 'percent')::numeric), 0)
    into v_sum, v_pct
    from jsonb_array_elements(p_installments) x;

  if round(v_sum, 2) <> round(p_total_value, 2) then
    raise exception 'A soma das parcelas (%) difere do valor do projeto (%)', v_sum, p_total_value;
  end if;
  if round(v_pct, 2) <> 100 then
    raise exception 'A soma dos percentuais deve ser 100%% (atual: % %%)', v_pct;
  end if;

  insert into public.projects (client_id, project_type, start_date, total_value, first_due_date, payment_condition_id, notes)
  values (p_client_id, p_project_type, p_start_date, p_total_value, p_first_due_date, p_payment_condition_id, p_notes)
  returning id into v_id;

  for r in
    select x, ord from jsonb_array_elements(p_installments) with ordinality as t(x, ord) order by ord
  loop
    n := n + 1;
    insert into public.installments (project_id, number, label, percent, amount, due_date)
    values (v_id, n, r.x ->> 'label', (r.x ->> 'percent')::numeric, (r.x ->> 'amount')::numeric, (r.x ->> 'due_date')::date);
  end loop;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- replace_pending_installments: recalcula o cronograma após mudança de valor.
-- Preserva parcelas que já têm recebimentos e parcelas canceladas (histórico);
-- substitui as demais pelas novas informadas. A soma final deve fechar com o
-- novo valor do projeto.
-- -----------------------------------------------------------------------------
create or replace function public.replace_pending_installments(
  p_project_id   uuid,
  p_total_value  numeric,
  p_installments jsonb
) returns void
language plpgsql as $$
declare
  v_kept numeric;
  v_new  numeric;
  v_max  integer;
  r      record;
  n      integer;
begin
  if not public.is_active_user() then
    raise exception 'Acesso negado';
  end if;
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'Projeto não encontrado';
  end if;

  select coalesce(sum(i.amount) filter (where i.canceled_at is null), 0)
    into v_kept
    from public.installments i
   where i.project_id = p_project_id
     and (i.canceled_at is not null
          or exists (select 1 from public.payments pay where pay.installment_id = i.id));

  select coalesce(sum((x ->> 'amount')::numeric), 0)
    into v_new
    from jsonb_array_elements(coalesce(p_installments, '[]'::jsonb)) x;

  if round(v_kept + v_new, 2) <> round(p_total_value, 2) then
    raise exception 'Parcelas mantidas (%) + novas (%) não fecham o valor do projeto (%)', v_kept, v_new, p_total_value;
  end if;

  delete from public.installments i
   where i.project_id = p_project_id
     and i.canceled_at is null
     and not exists (select 1 from public.payments pay where pay.installment_id = i.id);

  select coalesce(max(number), 0) into v_max from public.installments where project_id = p_project_id;
  n := v_max;

  for r in
    select x, ord from jsonb_array_elements(coalesce(p_installments, '[]'::jsonb)) with ordinality as t(x, ord) order by ord
  loop
    n := n + 1;
    insert into public.installments (project_id, number, label, percent, amount, due_date)
    values (p_project_id, n, r.x ->> 'label',
            (r.x ->> 'percent')::numeric, (r.x ->> 'amount')::numeric, (r.x ->> 'due_date')::date);
  end loop;

  update public.projects set total_value = p_total_value where id = p_project_id;
end $$;

-- -----------------------------------------------------------------------------
-- register_payment: registra recebimento total ou parcial.
-- Bloqueia valor acima do saldo, parcela cancelada e data futura.
-- -----------------------------------------------------------------------------
create or replace function public.register_payment(
  p_installment_id uuid,
  p_amount         numeric,
  p_paid_at        date,
  p_notes          text default null
) returns uuid
language plpgsql as $$
declare
  i      public.installments%rowtype;
  v_paid numeric;
  v_id   uuid;
begin
  if not public.is_active_user() then
    raise exception 'Acesso negado';
  end if;
  select * into i from public.installments where id = p_installment_id for update;
  if not found then
    raise exception 'Parcela não encontrada';
  end if;
  if i.canceled_at is not null then
    raise exception 'Parcela cancelada não pode receber pagamento';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Informe um valor maior que zero';
  end if;
  if p_paid_at is null or p_paid_at > public.brazil_today() then
    raise exception 'A data do recebimento não pode ser futura';
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments where installment_id = p_installment_id;
  if round(p_amount, 2) > round(i.amount - v_paid, 2) then
    raise exception 'O valor excede o saldo da parcela (saldo: %)', round(i.amount - v_paid, 2);
  end if;

  insert into public.payments (installment_id, amount, paid_at, notes)
  values (p_installment_id, p_amount, p_paid_at, nullif(trim(p_notes), ''))
  returning id into v_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Dados de demonstração (opcionais, claramente identificados com [DEMO])
-- Criar: Configurações > "Carregar dados de demonstração"
-- Remover: Configurações > "Remover dados de demonstração"
-- -----------------------------------------------------------------------------
create or replace function public.load_demo_data()
returns void
language plpgsql as $$
declare
  today date := public.brazil_today();
  c1 uuid; c2 uuid; c3 uuid;
  p1 uuid; p2 uuid; p3 uuid;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem carregar dados de demonstração';
  end if;

  insert into public.clients (name, cnpj, email, is_demo) values
    ('[DEMO] Empresa ABC Ltda',   '99000000000001', 'financeiro@abc-demo.com.br', true),
    ('[DEMO] Beta Offshore S.A.', '99000000000002', 'contas@beta-demo.com.br',    true),
    ('[DEMO] Gama Naval ME',      '99000000000003', 'adm@gama-demo.com.br',       true)
  on conflict (cnpj) do nothing;

  select id into c1 from public.clients where cnpj = '99000000000001';
  select id into c2 from public.clients where cnpj = '99000000000002';
  select id into c3 from public.clients where cnpj = '99000000000003';

  -- Projeto 1: Assessoria CRC, R$ 10.000, sinal 50% + 30 + 60 dias (começou há 70 dias)
  insert into public.projects (client_id, project_type, start_date, total_value, first_due_date, is_demo)
  values (c1, 'Assessoria CRC', today - 70, 10000, today - 70, true) returning id into p1;
  insert into public.installments (project_id, number, label, percent, amount, due_date) values
    (p1, 1, 'Sinal',      50, 5000, today - 70),
    (p1, 2, '2ª parcela', 25, 2500, today - 40),
    (p1, 3, '3ª parcela', 25, 2500, today - 10);
  insert into public.payments (installment_id, amount, paid_at)
    select id, 5000, today - 68 from public.installments where project_id = p1 and number = 1;
  insert into public.payments (installment_id, amount, paid_at, notes)
    select id, 1000, today - 30, 'Pagamento parcial (demo)' from public.installments where project_id = p1 and number = 2;

  -- Projeto 2: Treinamento, R$ 6.000, 50% + 50% (começou há 5 dias)
  insert into public.projects (client_id, project_type, start_date, total_value, first_due_date, is_demo)
  values (c2, 'Treinamento', today - 5, 6000, today - 5, true) returning id into p2;
  insert into public.installments (project_id, number, label, percent, amount, due_date) values
    (p2, 1, 'Sinal',      50, 3000, today - 5),
    (p2, 2, '2ª parcela', 50, 3000, today + 25);
  insert into public.payments (installment_id, amount, paid_at)
    select id, 3000, today - 4 from public.installments where project_id = p2 and number = 1;

  -- Projeto 3: CRC Petrobras, R$ 24.000, sinal + 30 + 60 + 90 (sinal vence hoje)
  insert into public.projects (client_id, project_type, start_date, total_value, first_due_date, is_demo)
  values (c3, 'CRC Petrobras', today, 24000, today, true) returning id into p3;
  insert into public.installments (project_id, number, label, percent, amount, due_date) values
    (p3, 1, 'Sinal',      40, 9600, today),
    (p3, 2, '2ª parcela', 20, 4800, today + 30),
    (p3, 3, '3ª parcela', 20, 4800, today + 60),
    (p3, 4, '4ª parcela', 20, 4800, today + 90);
end $$;

create or replace function public.remove_demo_data()
returns void
language plpgsql as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem remover dados de demonstração';
  end if;
  delete from public.payments
   where installment_id in (
     select i.id from public.installments i join public.projects p on p.id = i.project_id where p.is_demo);
  delete from public.projects where is_demo;
  delete from public.clients  where is_demo;
end $$;

grant execute on function
  public.create_project(uuid, text, date, numeric, date, uuid, text, jsonb),
  public.replace_pending_installments(uuid, numeric, jsonb),
  public.register_payment(uuid, numeric, date, text),
  public.load_demo_data(),
  public.remove_demo_data()
to authenticated;
