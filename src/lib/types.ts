export type InstallmentStatus = "a_vencer" | "vence_hoje" | "atrasado" | "parcial" | "pago" | "cancelado";

export const PROJECT_TYPES = [
  "CRC Petrobras",
  "Consultoria CRC",
  "Assessoria CRC",
  "Treinamento",
  "Cadastros Corporativos",
  "Suporte Pontual",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface ClientRow {
  id: string;
  name: string;
  cnpj: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
  projects_count: number;
  active_projects_count: number;
  total_contracted: number;
  total_received: number;
  total_pending: number;
  total_overdue: number;
}

export interface ProjectRow {
  id: string;
  client_id: string;
  client_name: string;
  cnpj: string;
  project_type: ProjectType;
  start_date: string;
  first_due_date: string;
  total_value: number;
  status: "ativo" | "concluido" | "cancelado";
  notes: string | null;
  payment_condition_id: string | null;
  payment_condition_name: string | null;
  created_at: string;
  total_received: number;
  total_pending: number;
  total_overdue: number;
  installments_count: number;
  installments_paid: number;
  schedule_diff: number;
}

export interface InstallmentRow {
  id: string;
  project_id: string;
  number: number;
  label: string;
  percent: number;
  amount: number;
  due_date: string;
  notes: string | null;
  canceled_at: string | null;
  client_id: string;
  client_name: string;
  cnpj: string;
  project_type: ProjectType;
  start_date: string;
  payment_condition_name: string | null;
  paid_amount: number;
  balance: number;
  paid_at: string | null;
  is_overdue: boolean;
  status: InstallmentStatus;
}

export interface PaymentRow {
  id: string;
  installment_id: string;
  amount: number;
  paid_at: string;
  notes: string | null;
  created_at: string;
}

export interface PaymentCondition {
  id: string;
  name: string;
  description: string | null;
  items: { label: string; percent: number; offset_days: number }[];
  is_default: boolean;
  active: boolean;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "user";
  active: boolean;
}

export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}
