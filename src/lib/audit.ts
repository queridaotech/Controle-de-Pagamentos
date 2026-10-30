import { formatBRL, formatDate } from "./format";
import type { AuditEntry } from "./types";

const FIELD_LABEL: Record<string, string> = {
  label: "descrição",
  amount: "valor",
  due_date: "vencimento",
  notes: "observações",
  canceled_at: "cancelamento",
  percent: "percentual",
  name: "nome",
  cnpj: "CNPJ",
  email: "e-mail",
  phone: "telefone",
  total_value: "valor total",
  status: "situação",
  project_type: "tipo de projeto",
  start_date: "data de início",
  first_due_date: "1º vencimento",
};

const TABLE_LABEL: Record<string, string> = {
  clients: "Cliente",
  projects: "Projeto",
  installments: "Parcela",
  payments: "Pagamento",
};

const IGNORED = new Set(["updated_at", "created_at", "created_by", "id"]);

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "amount" || key === "total_value") return formatBRL(Number(value));
  if (key === "due_date" || key === "start_date" || key === "first_due_date") return formatDate(String(value));
  if (key === "canceled_at") return value ? "cancelada" : "ativa";
  return String(value);
}

/** Resume uma linha do audit_log em português. */
export function describeAudit(e: AuditEntry): string {
  const table = TABLE_LABEL[e.table_name] ?? e.table_name;
  if (e.action === "INSERT") {
    if (e.table_name === "payments" && e.new_data) {
      return `Pagamento registrado: ${formatBRL(Number(e.new_data.amount))} em ${formatDate(String(e.new_data.paid_at))}`;
    }
    return `${table} criado(a)`;
  }
  if (e.action === "DELETE") {
    if (e.table_name === "payments" && e.old_data) {
      return `Pagamento estornado: ${formatBRL(Number(e.old_data.amount))} (${formatDate(String(e.old_data.paid_at))})`;
    }
    return `${table} excluído(a)`;
  }
  const changes: string[] = [];
  const keys = new Set([...Object.keys(e.old_data ?? {}), ...Object.keys(e.new_data ?? {})]);
  keys.forEach((k) => {
    if (IGNORED.has(k)) return;
    const before = e.old_data?.[k];
    const after = e.new_data?.[k];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push(`${FIELD_LABEL[k] ?? k}: ${show(k, before)} → ${show(k, after)}`);
    }
  });
  return changes.length ? `${table} alterado(a) — ${changes.join("; ")}` : `${table} atualizado(a)`;
}
