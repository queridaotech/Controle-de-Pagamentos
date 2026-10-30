-- -----------------------------------------------------------------------------
-- Nota Fiscal do projeto: número e arquivo PDF (ambos opcionais)
--   projects.invoice_number     número da NF
--   projects.invoice_file_path  caminho do PDF no Storage (bucket privado "invoices")
--   projects.invoice_file_name  nome original do arquivo (usado no download)
-- -----------------------------------------------------------------------------
alter table public.projects
  add column invoice_number    text check (invoice_number is null or length(trim(invoice_number)) > 0),
  add column invoice_file_path text,
  add column invoice_file_name text;

-- A view ganha as novas colunas no final (compatível com a definição anterior)
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
  (coalesce(sum(iv.amount) filter (where iv.status <> 'cancelado'), 0) - p.total_value)::numeric(14, 2) as schedule_diff,
  p.invoice_number,
  p.invoice_file_path,
  p.invoice_file_name
from public.projects p
join public.clients c on c.id = p.client_id
left join public.payment_conditions pc on pc.id = p.payment_condition_id
left join public.installments_view iv on iv.project_id = p.id
group by p.id, c.name, c.cnpj, pc.name;

-- Bucket privado, somente PDF, até 10 MB por arquivo
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

-- Somente usuários autenticados e ativos acessam os arquivos
create policy invoices_select on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and public.is_active_user());
create policy invoices_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and public.is_active_user());
create policy invoices_update on storage.objects for update to authenticated
  using (bucket_id = 'invoices' and public.is_active_user())
  with check (bucket_id = 'invoices' and public.is_active_user());
create policy invoices_delete on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and public.is_active_user());
