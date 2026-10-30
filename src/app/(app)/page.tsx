"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, BadgeDollarSign, BarChart3, CalendarCheck, Clock, FolderKanban, Gauge, Receipt, TrendingUp, Users } from "lucide-react";
import { fetchClients, fetchInstallments, fetchPayments, fetchProjects } from "@/lib/data";
import { useQuery } from "@/lib/hooks";
import { computeDashboard, RANGE_LABEL, resolveRange, type RangeKey } from "@/lib/metrics";
import { formatBRL, formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CumulativeArea, MonthlyBars, RankBars, StatusDonut } from "@/components/charts";
import { Button, Card, ErrorBox, Input, KpiCard, PageHeader, Spinner } from "@/components/ui";

const RANGES: RangeKey[] = ["mes_atual", "3m", "6m", "12m", "ano", "custom"];

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <h2 className="text-[15px] font-bold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4 h-[260px]">{children}</div>
    </Card>
  );
}

export default function DashboardPage() {
  const today = todayISO();
  const [rangeKey, setRangeKey] = useState<RangeKey>("6m");
  const [custom, setCustom] = useState({ from: `${today.slice(0, 4)}-01-01`, to: today });

  const { data, error, loading, reload } = useQuery(async () => {
    const [projects, installments, payments, clients] = await Promise.all([fetchProjects(), fetchInstallments(), fetchPayments(), fetchClients()]);
    return { projects, installments, payments, clients };
  });

  const range = useMemo(() => resolveRange(rangeKey, today, custom), [rangeKey, today, custom]);
  const dash = useMemo(() => (data ? computeDashboard({ ...data, today, range }) : null), [data, today, range]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão executiva de contratos, recebimentos e valores a receber." />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGES.map((k) => (
          <button
            key={k}
            onClick={() => setRangeKey(k)}
            aria-pressed={rangeKey === k}
            className={cn(
              "h-10 rounded-full px-4 text-sm font-semibold transition",
              rangeKey === k ? "bg-brand-600 text-white shadow-sm" : "bg-white text-muted shadow-card hover:text-ink",
            )}
          >
            {RANGE_LABEL[k]}
          </button>
        ))}
        {rangeKey === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" className="h-10 w-40" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="Data inicial" />
            <span className="text-sm text-muted">até</span>
            <Input type="date" className="h-10 w-40" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="Data final" />
          </div>
        )}
        <span className="ml-auto text-xs text-muted">
          Período: {formatDate(range.from)} a {formatDate(range.to)}
        </span>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !dash && <Spinner />}

      {dash && data && (
        <>
          {data.projects.length === 0 && (
            <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-semibold">Comece cadastrando seu primeiro cliente e projeto</p>
                <p className="text-sm text-muted">Os indicadores aparecem assim que houver projetos e pagamentos registrados.</p>
              </div>
              <div className="flex gap-2">
                <Link href="/clientes">
                  <Button>Cadastrar cliente</Button>
                </Link>
                <Link href="/configuracoes">
                  <Button variant="outline">Carregar dados de demonstração</Button>
                </Link>
              </div>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard tone="hero" label="Faturamento contratado" value={formatBRL(dash.kpis.contracted)} caption={`${dash.kpis.projectsInRange} projeto(s) iniciados no período`} icon={<BadgeDollarSign className="h-4 w-4" />} />
            <KpiCard label="Total recebido" value={formatBRL(dash.kpis.received)} caption="Pagamentos efetivamente recebidos no período" icon={<Receipt className="h-4 w-4" />} />
            <KpiCard label="Total a receber" value={formatBRL(dash.kpis.toReceive)} caption="Saldo em aberto hoje (todos os projetos)" icon={<Clock className="h-4 w-4" />} />
            <KpiCard tone="danger" label="Total em atraso" value={formatBRL(dash.kpis.overdue)} caption="Vencido e não pago até hoje" icon={<AlertTriangle className="h-4 w-4" />} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard label="Recebimentos do mês" value={formatBRL(dash.kpis.receivedThisMonth)} caption="Mês atual" icon={<CalendarCheck className="h-4 w-4" />} />
            <KpiCard label="Previsão (30 dias)" value={formatBRL(dash.kpis.forecast30)} caption="Parcelas que vencem de hoje a +30 dias" icon={<TrendingUp className="h-4 w-4" />} />
            <KpiCard label="Clientes ativos" value={String(dash.kpis.activeClients)} caption="Com ao menos um projeto ativo" icon={<Users className="h-4 w-4" />} />
            <KpiCard label="Projetos ativos" value={String(dash.kpis.activeProjects)} caption="Situação “Ativo”" icon={<FolderKanban className="h-4 w-4" />} />
            <KpiCard label="Ticket médio / projeto" value={formatBRL(dash.kpis.avgTicketProject)} caption="Média dos projetos do período" icon={<Gauge className="h-4 w-4" />} />
            <KpiCard label="Ticket médio mensal" value={formatBRL(dash.kpis.avgTicketMonthly)} caption={`Recebido ÷ ${dash.kpis.monthsInRange} mês(es) do período`} icon={<BarChart3 className="h-4 w-4" />} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Faturamento mensal" subtitle="Valor contratado, por mês de início dos projetos">
              <MonthlyBars data={dash.monthly} series={["contracted"]} />
            </ChartCard>
            <ChartCard title="Recebimentos mensais" subtitle="Valores efetivamente recebidos, por mês">
              <MonthlyBars data={dash.monthly} series={["received"]} />
            </ChartCard>
            <ChartCard title="Contratado × recebido" subtitle="Comparativo mês a mês">
              <MonthlyBars data={dash.monthly} series={["contracted", "received"]} />
            </ChartCard>
            <ChartCard title="Evolução dos recebimentos" subtitle="Total recebido acumulado no período">
              <CumulativeArea data={dash.monthly} />
            </ChartCard>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Recebíveis por status" subtitle="Valor das parcelas de projetos ativos e concluídos (carteira total)">
              <StatusDonut data={dash.byStatus} />
            </ChartCard>
            <Card className="p-5">
              <h2 className="text-[15px] font-bold">Faturamento por tipo de projeto</h2>
              <p className="mt-0.5 text-xs text-muted">Valor contratado no período</p>
              <div className="mt-5">
                <RankBars items={dash.byType.map((t) => ({ key: t.type, label: t.type, value: t.amount }))} />
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="text-[15px] font-bold">Ranking de clientes</h2>
              <p className="mt-0.5 text-xs text-muted">Maior faturamento contratado no período</p>
              <div className="mt-5">
                <RankBars items={dash.topClients.map((c) => ({ key: c.id, label: c.name, value: c.amount }))} />
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="text-[15px] font-bold">Ranking de projetos</h2>
              <p className="mt-0.5 text-xs text-muted">Maiores valores contratados no período</p>
              <div className="mt-5">
                <RankBars items={dash.topProjects.map((p) => ({ key: p.id, label: p.name, sub: p.client, value: p.amount }))} />
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
