-- =============================================================================
-- Migration 02: views financeiras (status calculado dinamicamente)
-- Views com security_invoker respeitam o RLS das tabelas de origem.
-- =============================================================================

-- Parcelas com valores pagos, saldo e status calculado pela data de hoje (Brasília)
--   status: cancelado | pago | parcial | atrasado | vence_hoje | a_vencer
--   Uma parcela só é "paga" depois de existir recebimento registrado.
--   "parcial" (pagamento parcial) mantém is_overdue = true se a data já passou.
create or replace view public.installments_view
with (security_invoker = true) as
with pay as (
  select installment_id,
         sum(amount)  as paid_amount,
         max(paid_at) as last_paid_at
    from public.payments
   group by installment_id
)
select
  i.id,
  i.project_id,
  i.number,
  i.label,
  i.percent,
  i.amount,
  i.due_date,
  i.notes,
  i.canceled_at,
  c.id                       as client_id,
  c.name                     as client_name,
  c.cnpj                     as cnpj,
  p.project_type,
  p.start_date,
  pc.name                    as payment_condition_name,
  coalesce(pay.paid_amount, 0)::numeric(14, 2)                       as paid_amount,
  case when i.canceled_at is not null then 0
       else greatest(i.amount - coalesce(pay.paid_amount, 0), 0) end::numeric(14, 2) as balance,
  pay.last_paid_at           as paid_at,
  (i.canceled_at is null
     and i.amount - coalesce(pay.paid_amount, 0) > 0
     and i.due_date < public.brazil_today())                         as is_overdue,
  case
    when i.canceled_at is not null                                   then 'cancelado'
    when coalesce(pay.paid_amount, 0) >= i.amount                    then 'pago'
    when coalesce(pay.paid_amount, 0) > 0                            then 'parcial'
    when i.due_date < public.brazil_today()                          then 'atrasado'
    when i.due_date = public.brazil_today()                          then 'vence_hoje'
    else 'a_vencer'
  end                        as status
from public.installments i
join public.projects p  on p.id = i.project_id
join public.clients  c  on c.id = p.client_id
left join public.payment_conditions pc on pc.id = p.payment_condition_id
left join pay on pay.installment_id = i.id;

-- Projetos com totais: contratado, recebido, pendente, atrasado e divergência de cronograma
create or replace view public.projects_view
with (security_invoker = true) as
select
  p.id,
  p.client_id,
  c.name  as client_name,
  c.cnpj  as cnpj,
  p.project_type,
  p.start_date,
  p.first_due_date,
  p.total_value,
  p.status,
  p.notes,
  p.payment_condition_id,
  pc.name as payment_condition_name,
  p.created_at,
  coalesce(sum(iv.paid_amount), 0)::numeric(14, 2)                                  as total_received,
  coalesce(sum(iv.balance), 0)::numeric(14, 2)                                      as total_pending,
  coalesce(sum(iv.balance) filter (where iv.is_overdue), 0)::numeric(14, 2)         as total_overdue,
  count(iv.id) filter (where iv.status <> 'cancelado')                              as installments_count,
  count(iv.id) filter (where iv.status = 'pago')                                    as installments_paid,
  -- diferença entre a soma das parcelas ativas e o valor contratado (0 = consistente)
  (coalesce(sum(iv.amount) filter (where iv.status <> 'cancelado'), 0) - p.total_value)::numeric(14, 2) as schedule_diff
from public.projects p
join public.clients c on c.id = p.client_id
left join public.payment_conditions pc on pc.id = p.payment_condition_id
left join public.installments_view iv on iv.project_id = p.id
group by p.id, c.name, c.cnpj, pc.name;

-- Clientes com totais consolidados (ignora projetos cancelados)
create or replace view public.clients_view
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.cnpj,
  c.email,
  c.phone,
  c.notes,
  c.is_demo,
  c.created_at,
  count(pv.id) filter (where pv.status <> 'cancelado')                                        as projects_count,
  count(pv.id) filter (where pv.status = 'ativo')                                             as active_projects_count,
  coalesce(sum(pv.total_value) filter (where pv.status <> 'cancelado'), 0)::numeric(14, 2)    as total_contracted,
  coalesce(sum(pv.total_received) filter (where pv.status <> 'cancelado'), 0)::numeric(14, 2) as total_received,
  coalesce(sum(pv.total_pending) filter (where pv.status <> 'cancelado'), 0)::numeric(14, 2)  as total_pending,
  coalesce(sum(pv.total_overdue) filter (where pv.status <> 'cancelado'), 0)::numeric(14, 2)  as total_overdue
from public.clients c
left join public.projects_view pv on pv.client_id = c.id
group by c.id;

grant select on public.installments_view, public.projects_view, public.clients_view to authenticated;
