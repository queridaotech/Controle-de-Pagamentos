"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatMonth } from "@/lib/format";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/status";
import type { InstallmentStatus } from "@/lib/types";

const GREEN = { 600: "#005A32", 500: "#238B45", 400: "#41AB5D", 300: "#74C476", 200: "#A1D99B", 100: "#C7E9C0" };

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const axisMoney = (v: number) => (v === 0 ? "0" : `R$ ${compact.format(v)}`);

const tooltipStyle = {
  borderRadius: 14,
  border: "1px solid #E3E9E4",
  boxShadow: "0 12px 32px -12px rgba(10,34,24,.25)",
  fontSize: 13,
};

export function Empty({ text = "Sem dados no período." }: { text?: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted">{text}</div>;
}

type MonthPoint = { month: string; contracted: number; received: number; cumulativeReceived: number };

/** Barras por mês: série única (faturamento ou recebimentos) ou comparativo contratado x recebido. */
export function MonthlyBars({ data, series }: { data: MonthPoint[]; series: ("contracted" | "received")[] }) {
  if (data.length === 0 || data.every((d) => series.every((s) => d[s] === 0))) return <Empty />;
  const names = { contracted: "Contratado", received: "Recebido" };
  const colors = { contracted: GREEN[200], received: GREEN[500] };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="#E3E9E4" strokeDasharray="3 3" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} axisLine={false} fontSize={12} stroke="#66756C" />
        <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} fontSize={12} stroke="#66756C" width={64} />
        <Tooltip formatter={(v) => formatBRL(Number(v))} labelFormatter={(l) => formatMonth(String(l))} contentStyle={tooltipStyle} cursor={{ fill: "#EDF8E9" }} />
        {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar key={s} dataKey={s} name={names[s]} fill={colors[s]} radius={[8, 8, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Evolução acumulada dos recebimentos. */
export function CumulativeArea({ data }: { data: MonthPoint[] }) {
  if (data.length === 0 || data.every((d) => d.cumulativeReceived === 0)) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="recv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN[400]} stopOpacity={0.45} />
            <stop offset="100%" stopColor={GREEN[400]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#E3E9E4" strokeDasharray="3 3" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} axisLine={false} fontSize={12} stroke="#66756C" />
        <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} fontSize={12} stroke="#66756C" width={64} />
        <Tooltip formatter={(v) => formatBRL(Number(v))} labelFormatter={(l) => formatMonth(String(l))} contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="cumulativeReceived" name="Recebido acumulado" stroke={GREEN[500]} strokeWidth={2.5} fill="url(#recv)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Rosca: distribuição dos recebíveis por status. */
export function StatusDonut({ data }: { data: { status: InstallmentStatus; amount: number; count: number }[] }) {
  if (data.length === 0) return <Empty text="Nenhuma parcela cadastrada." />;
  const rows = data.map((d) => ({ ...d, name: STATUS_LABEL[d.status] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={rows} dataKey="amount" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke="none">
          {rows.map((r) => (
            <Cell key={r.status} fill={STATUS_STYLE[r.status].chart} />
          ))}
        </Pie>
        <Tooltip formatter={(v, _n, item) => [`${formatBRL(Number(v))} (${(item?.payload as { count: number }).count} parc.)`, ""]} contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais simples (rankings e faturamento por tipo). */
export function RankBars({ items, empty }: { items: { key: string; label: string; sub?: string; value: number }[]; empty?: string }) {
  if (items.length === 0) return <div className="py-8 text-center text-sm text-muted">{empty ?? "Sem dados no período."}</div>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3.5">
      {items.map((i, idx) => (
        <li key={i.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">
              <span className="mr-2 text-xs text-muted">{idx + 1}.</span>
              {i.label}
              {i.sub && <span className="ml-2 text-xs font-normal text-muted">{i.sub}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatBRL(i.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-50">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-500" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
