import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDashboard, resolveRange } from "../src/lib/metrics";
import type { ClientRow, InstallmentRow, PaymentRow, ProjectRow } from "../src/lib/types";

const today = "2026-11-15";

const proj = (id: string, client: string, value: number, start: string, status: ProjectRow["status"] = "ativo"): ProjectRow =>
  ({ id, client_id: client, client_name: `Cliente ${client}`, project_type: "Treinamento", start_date: start, total_value: value, status } as ProjectRow);

const inst = (id: string, project_id: string, amount: number, due: string, status: InstallmentRow["status"], paid = 0): InstallmentRow =>
  ({
    id, project_id, amount, due_date: due, status, paid_amount: paid,
    balance: status === "cancelado" ? 0 : Math.max(amount - paid, 0),
    is_overdue: (status === "atrasado" || status === "parcial") && due < today && amount - paid > 0,
  } as InstallmentRow);

const projects = [
  proj("p1", "c1", 10000, "2026-11-01"),
  proj("p2", "c2", 6000, "2026-10-10"),
  proj("p3", "c1", 3000, "2026-11-05", "cancelado"),
];
const installments = [
  inst("i1", "p1", 5000, "2026-11-01", "pago", 5000),
  inst("i2", "p1", 2500, "2026-11-10", "atrasado"),
  inst("i3", "p1", 2500, "2026-12-01", "a_vencer"),
  inst("i4", "p2", 3000, "2026-10-10", "pago", 3000),
  inst("i5", "p2", 3000, "2026-12-20", "a_vencer"),
  inst("i6", "p3", 3000, "2026-11-05", "atrasado"), // projeto cancelado: não conta
];
const payments = [
  { id: "a", installment_id: "i1", amount: 5000, paid_at: "2026-11-02" },
  { id: "b", installment_id: "i4", amount: 3000, paid_at: "2026-10-11" },
] as PaymentRow[];
const clients = [
  { id: "c1", active_projects_count: 1 },
  { id: "c2", active_projects_count: 1 },
] as ClientRow[];

test("faixas de período", () => {
  assert.deepEqual(resolveRange("mes_atual", today), { from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(resolveRange("3m", today), { from: "2026-09-01", to: "2026-11-30" });
  assert.deepEqual(resolveRange("12m", today), { from: "2025-12-01", to: "2026-11-30" });
  assert.deepEqual(resolveRange("ano", today), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(resolveRange("custom", today, { from: "2026-12-01", to: "2026-01-01" }), { from: "2026-01-01", to: "2026-12-01" });
});

test("KPIs do mês atual: parcelas futuras e projetos cancelados não viram dinheiro recebido", () => {
  const d = computeDashboard({ projects, installments, payments, clients, today, range: resolveRange("mes_atual", today) });
  assert.equal(d.kpis.contracted, 10000); // p3 cancelado fora; p2 iniciou em outubro
  assert.equal(d.kpis.received, 5000); // só o pagamento de 02/11
  assert.equal(d.kpis.toReceive, 2500 + 2500 + 3000); // i2 + i3 + i5
  assert.equal(d.kpis.overdue, 2500); // i6 (cancelado) fora
  assert.equal(d.kpis.receivedThisMonth, 5000);
  assert.equal(d.kpis.forecast30, 2500); // i3 vence 01/12; i5 só em 20/12 (>30 dias: 15/12)
  assert.equal(d.kpis.activeProjects, 2);
  assert.equal(d.kpis.avgTicketProject, 10000);
  assert.equal(d.kpis.avgTicketMonthly, 5000);
});

test("últimos 3 meses: ticket médio mensal divide pelos meses do período", () => {
  const d = computeDashboard({ projects, installments, payments, clients, today, range: resolveRange("3m", today) });
  assert.equal(d.kpis.contracted, 16000);
  assert.equal(d.kpis.received, 8000);
  assert.equal(d.kpis.avgTicketMonthly, Math.round((8000 / 3) * 100) / 100);
  assert.equal(d.kpis.avgTicketProject, 8000);
  assert.deepEqual(d.monthly.map((m) => [m.month, m.contracted, m.received, m.cumulativeReceived]), [
    ["2026-09", 0, 0, 0],
    ["2026-10", 6000, 3000, 3000],
    ["2026-11", 10000, 5000, 8000],
  ]);
  assert.equal(d.topClients[0].name, "Cliente c1");
  assert.equal(d.byStatus.find((s) => s.status === "atrasado")?.count, 1);
});
