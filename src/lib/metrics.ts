import { addDaysISO, addMonthsISO, endOfMonthISO, monthKey, monthsBetween, startOfMonthISO } from "./format";
import type { ClientRow, InstallmentRow, InstallmentStatus, PaymentRow, ProjectRow } from "./types";

/**
 * Cálculos do dashboard. Funções puras (sem acesso a banco) para poderem ser testadas.
 *
 * Definições (cada KPI mostra no card a base usada):
 *  - Contratado: projetos INICIADOS no período (não cancelados).
 *  - Recebido: pagamentos efetivamente registrados com data de recebimento no período.
 *    Parcelas futuras ou sem pagamento registrado NUNCA entram como recebido.
 *  - A receber / Em atraso: carteira em aberto hoje (não depende do período).
 *  - Previsão: saldo de parcelas que vencem de hoje até +30 dias.
 */

export type RangeKey = "mes_atual" | "3m" | "6m" | "12m" | "ano" | "custom";

export interface DateRange {
  from: string;
  to: string;
}

export const RANGE_LABEL: Record<RangeKey, string> = {
  mes_atual: "Mês atual",
  "3m": "Últimos 3 meses",
  "6m": "Últimos 6 meses",
  "12m": "Últimos 12 meses",
  ano: "Ano atual",
  custom: "Personalizado",
};

export function resolveRange(key: RangeKey, today: string, custom?: Partial<DateRange>): DateRange {
  const monthsBack = (n: number): DateRange => ({
    from: startOfMonthISO(addMonthsISO(today, -(n - 1))),
    to: endOfMonthISO(today),
  });
  switch (key) {
    case "mes_atual":
      return monthsBack(1);
    case "3m":
      return monthsBack(3);
    case "6m":
      return monthsBack(6);
    case "12m":
      return monthsBack(12);
    case "ano":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "custom": {
      const from = custom?.from || startOfMonthISO(today);
      const to = custom?.to || endOfMonthISO(today);
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

export const inRange = (iso: string, r: DateRange) => iso >= r.from && iso <= r.to;
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

export interface DashboardInput {
  projects: ProjectRow[];
  installments: InstallmentRow[];
  payments: PaymentRow[];
  clients: ClientRow[];
  today: string;
  range: DateRange;
}

export interface DashboardData {
  kpis: {
    contracted: number;
    received: number;
    toReceive: number;
    overdue: number;
    receivedThisMonth: number;
    forecast30: number;
    activeClients: number;
    activeProjects: number;
    avgTicketProject: number;
    avgTicketMonthly: number;
    projectsInRange: number;
    monthsInRange: number;
  };
  monthly: { month: string; contracted: number; received: number; cumulativeReceived: number }[];
  byStatus: { status: InstallmentStatus; amount: number; count: number }[];
  byType: { type: string; amount: number }[];
  topClients: { id: string; name: string; amount: number }[];
  topProjects: { id: string; name: string; client: string; amount: number }[];
}

export function computeDashboard({ projects, installments, payments, clients, today, range }: DashboardInput): DashboardData {
  const live = projects.filter((p) => p.status !== "cancelado");
  const liveIds = new Set(live.map((p) => p.id));
  const liveInst = installments.filter((i) => liveIds.has(i.project_id));
  const instById = new Map(installments.map((i) => [i.id, i]));
  const livePayments = payments.filter((p) => {
    const inst = instById.get(p.installment_id);
    return inst ? liveIds.has(inst.project_id) : false;
  });

  const projInRange = live.filter((p) => inRange(p.start_date, range));
  const payInRange = livePayments.filter((p) => inRange(p.paid_at, range));
  const monthStart = startOfMonthISO(today);
  const monthEnd = endOfMonthISO(today);
  const horizon = addDaysISO(today, 30);

  const months = monthsBetween(range.from, range.to);
  const contracted = sum(projInRange.map((p) => p.total_value));
  const received = sum(payInRange.map((p) => p.amount));

  let running = 0;
  const monthly = months.map((m) => {
    const c = sum(projInRange.filter((p) => monthKey(p.start_date) === m).map((p) => p.total_value));
    const r = sum(payInRange.filter((p) => monthKey(p.paid_at) === m).map((p) => p.amount));
    running = sum([running, r]);
    return { month: m, contracted: c, received: r, cumulativeReceived: running };
  });

  const statusOrder: InstallmentStatus[] = ["pago", "parcial", "a_vencer", "vence_hoje", "atrasado", "cancelado"];
  const byStatus = statusOrder
    .map((status) => {
      const list = liveInst.filter((i) => i.status === status);
      return { status, amount: sum(list.map((i) => i.amount)), count: list.length };
    })
    .filter((s) => s.count > 0);

  const typeMap = new Map<string, number>();
  projInRange.forEach((p) => typeMap.set(p.project_type, (typeMap.get(p.project_type) ?? 0) + p.total_value));
  const byType = [...typeMap].map(([type, amount]) => ({ type, amount: sum([amount]) })).sort((a, b) => b.amount - a.amount);

  const clientMap = new Map<string, { name: string; amount: number }>();
  projInRange.forEach((p) => {
    const cur = clientMap.get(p.client_id) ?? { name: p.client_name, amount: 0 };
    cur.amount += p.total_value;
    clientMap.set(p.client_id, cur);
  });
  const topClients = [...clientMap]
    .map(([id, v]) => ({ id, name: v.name, amount: sum([v.amount]) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const topProjects = [...projInRange]
    .sort((a, b) => b.total_value - a.total_value)
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.project_type, client: p.client_name, amount: p.total_value }));

  return {
    kpis: {
      contracted,
      received,
      toReceive: sum(liveInst.map((i) => i.balance)),
      overdue: sum(liveInst.filter((i) => i.is_overdue).map((i) => i.balance)),
      receivedThisMonth: sum(livePayments.filter((p) => p.paid_at >= monthStart && p.paid_at <= monthEnd).map((p) => p.amount)),
      forecast30: sum(liveInst.filter((i) => !i.is_overdue && i.balance > 0 && i.due_date >= today && i.due_date <= horizon).map((i) => i.balance)),
      activeClients: clients.filter((c) => c.active_projects_count > 0).length,
      activeProjects: live.filter((p) => p.status === "ativo").length,
      avgTicketProject: projInRange.length ? sum([contracted / projInRange.length]) : 0,
      avgTicketMonthly: months.length ? sum([received / months.length]) : 0,
      projectsInRange: projInRange.length,
      monthsInRange: months.length,
    },
    monthly,
    byStatus,
    byType,
    topClients,
    topProjects,
  };
}
