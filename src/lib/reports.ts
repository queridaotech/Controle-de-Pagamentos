import { formatBRL, formatCNPJ, formatDate } from "./format";
import { STATUS_LABEL } from "./status";
import type { DateRange } from "./metrics";
import type { InstallmentRow, PaymentRow, ProjectRow } from "./types";
import type { Cell } from "./export";

export type ReportKey = "faturamento" | "recebimentos" | "inadimplencia" | "receber" | "cliente" | "tipo";

export const REPORTS: { key: ReportKey; label: string; description: string; usesRange: boolean }[] = [
  { key: "faturamento", label: "Faturamento por período", description: "Projetos iniciados no período, com valor contratado, recebido e saldo.", usesRange: true },
  { key: "recebimentos", label: "Recebimentos", description: "Pagamentos efetivamente recebidos no período.", usesRange: true },
  { key: "inadimplencia", label: "Inadimplência", description: "Parcelas vencidas e não pagas até hoje (não depende do período).", usesRange: false },
  { key: "receber", label: "Contas a receber", description: "Parcelas em aberto com vencimento no período.", usesRange: true },
  { key: "cliente", label: "Faturamento por cliente", description: "Valor contratado por cliente (projetos iniciados no período).", usesRange: true },
  { key: "tipo", label: "Faturamento por tipo de projeto", description: "Valor contratado por tipo de projeto (projetos iniciados no período).", usesRange: true },
];

export interface ReportData {
  headers: string[];
  rows: Cell[][];
  /** índices das colunas numéricas (alinhadas à direita) */
  numeric: number[];
  totals: Cell[] | null;
}

const inRange = (iso: string, r: DateRange) => iso >= r.from && iso <= r.to;
const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

export function buildReport(
  key: ReportKey,
  src: { projects: ProjectRow[]; installments: InstallmentRow[]; payments: PaymentRow[] },
  range: DateRange,
  today: string,
): ReportData {
  const live = src.projects.filter((p) => p.status !== "cancelado");
  const liveIds = new Set(live.map((p) => p.id));
  const inst = src.installments.filter((i) => liveIds.has(i.project_id));
  const instById = new Map(src.installments.map((i) => [i.id, i]));

  switch (key) {
    case "faturamento": {
      const list = live.filter((p) => inRange(p.start_date, range)).sort((a, b) => a.start_date.localeCompare(b.start_date));
      return {
        headers: ["Cliente", "CNPJ", "Projeto", "Início", "Valor contratado", "Recebido", "Saldo pendente"],
        numeric: [4, 5, 6],
        rows: list.map((p) => [p.client_name, formatCNPJ(p.cnpj), p.project_type, formatDate(p.start_date), formatBRL(p.total_value), formatBRL(p.total_received), formatBRL(p.total_pending)]),
        totals: ["Total", "", "", "", formatBRL(sum(list.map((p) => p.total_value))), formatBRL(sum(list.map((p) => p.total_received))), formatBRL(sum(list.map((p) => p.total_pending)))],
      };
    }
    case "recebimentos": {
      const list = src.payments.filter((p) => inRange(p.paid_at, range) && instById.has(p.installment_id) && liveIds.has(instById.get(p.installment_id)!.project_id)).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
      return {
        headers: ["Data", "Cliente", "CNPJ", "Projeto", "Parcela", "Valor recebido", "Observações"],
        numeric: [5],
        rows: list.map((p) => {
          const i = instById.get(p.installment_id)!;
          return [formatDate(p.paid_at), i.client_name, formatCNPJ(i.cnpj), i.project_type, `${i.number} - ${i.label}`, formatBRL(p.amount), p.notes ?? ""];
        }),
        totals: ["Total", "", "", "", "", formatBRL(sum(list.map((p) => p.amount))), ""],
      };
    }
    case "inadimplencia": {
      const list = inst.filter((i) => i.is_overdue).sort((a, b) => a.due_date.localeCompare(b.due_date));
      return {
        headers: ["Cliente", "CNPJ", "Projeto", "Parcela", "Vencimento", "Dias em atraso", "Valor da parcela", "Já recebido", "Saldo em atraso"],
        numeric: [5, 6, 7, 8],
        rows: list.map((i) => [i.client_name, formatCNPJ(i.cnpj), i.project_type, `${i.number} - ${i.label}`, formatDate(i.due_date), daysBetween(i.due_date, today), formatBRL(i.amount), formatBRL(i.paid_amount), formatBRL(i.balance)]),
        totals: ["Total", "", "", "", "", "", formatBRL(sum(list.map((i) => i.amount))), formatBRL(sum(list.map((i) => i.paid_amount))), formatBRL(sum(list.map((i) => i.balance)))],
      };
    }
    case "receber": {
      const list = inst.filter((i) => i.balance > 0 && i.status !== "cancelado" && inRange(i.due_date, range)).sort((a, b) => a.due_date.localeCompare(b.due_date));
      return {
        headers: ["Cliente", "CNPJ", "Projeto", "Parcela", "Vencimento", "Status", "Valor da parcela", "Já recebido", "Saldo a receber"],
        numeric: [6, 7, 8],
        rows: list.map((i) => [i.client_name, formatCNPJ(i.cnpj), i.project_type, `${i.number} - ${i.label}`, formatDate(i.due_date), STATUS_LABEL[i.status], formatBRL(i.amount), formatBRL(i.paid_amount), formatBRL(i.balance)]),
        totals: ["Total", "", "", "", "", "", formatBRL(sum(list.map((i) => i.amount))), formatBRL(sum(list.map((i) => i.paid_amount))), formatBRL(sum(list.map((i) => i.balance)))],
      };
    }
    case "cliente":
    case "tipo": {
      const list = live.filter((p) => inRange(p.start_date, range));
      const groups = new Map<string, { name: string; cnpj?: string; items: ProjectRow[] }>();
      list.forEach((p) => {
        const k = key === "cliente" ? p.client_id : p.project_type;
        const g = groups.get(k) ?? { name: key === "cliente" ? p.client_name : p.project_type, cnpj: key === "cliente" ? p.cnpj : undefined, items: [] };
        g.items.push(p);
        groups.set(k, g);
      });
      const rows = [...groups.values()]
        .map((g) => ({ g, contracted: sum(g.items.map((p) => p.total_value)), received: sum(g.items.map((p) => p.total_received)), pending: sum(g.items.map((p) => p.total_pending)) }))
        .sort((a, b) => b.contracted - a.contracted);
      const total = sum(rows.map((r) => r.contracted));
      return {
        headers: key === "cliente" ? ["Cliente", "CNPJ", "Projetos", "Valor contratado", "Recebido", "Saldo pendente", "% do total"] : ["Tipo de projeto", "Projetos", "Valor contratado", "Recebido", "Saldo pendente", "% do total"],
        numeric: key === "cliente" ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
        rows: rows.map((r) => {
          const pct = total > 0 ? `${((r.contracted / total) * 100).toFixed(1).replace(".", ",")}%` : "—";
          return key === "cliente"
            ? [r.g.name, formatCNPJ(r.g.cnpj), r.g.items.length, formatBRL(r.contracted), formatBRL(r.received), formatBRL(r.pending), pct]
            : [r.g.name, r.g.items.length, formatBRL(r.contracted), formatBRL(r.received), formatBRL(r.pending), pct];
        }),
        totals:
          key === "cliente"
            ? ["Total", "", list.length, formatBRL(total), formatBRL(sum(rows.map((r) => r.received))), formatBRL(sum(rows.map((r) => r.pending))), rows.length ? "100,0%" : ""]
            : ["Total", list.length, formatBRL(total), formatBRL(sum(rows.map((r) => r.received))), formatBRL(sum(rows.map((r) => r.pending))), rows.length ? "100,0%" : ""],
      };
    }
  }
}
