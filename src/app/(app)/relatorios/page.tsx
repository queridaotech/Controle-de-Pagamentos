"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { fetchInstallments, fetchPayments, fetchProjects } from "@/lib/data";
import { useQuery } from "@/lib/hooks";
import { RANGE_LABEL, resolveRange, type RangeKey } from "@/lib/metrics";
import { buildReport, REPORTS, type ReportKey } from "@/lib/reports";
import { formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner } from "@/components/ui";
import { ExportMenu } from "@/components/export-menu";

const RANGES: RangeKey[] = ["mes_atual", "3m", "6m", "12m", "ano", "custom"];

export default function RelatoriosPage() {
  const today = todayISO();
  const { data, error, loading, reload } = useQuery(async () => {
    const [projects, installments, payments] = await Promise.all([fetchProjects(), fetchInstallments(), fetchPayments()]);
    return { projects, installments, payments };
  });
  const [key, setKey] = useState<ReportKey>("faturamento");
  const [rangeKey, setRangeKey] = useState<RangeKey>("ano");
  const [custom, setCustom] = useState({ from: `${today.slice(0, 4)}-01-01`, to: today });

  const meta = REPORTS.find((r) => r.key === key)!;
  const range = useMemo(() => resolveRange(rangeKey, today, custom), [rangeKey, today, custom]);
  const report = useMemo(() => (data ? buildReport(key, data, range, today) : null), [data, key, range, today]);
  const filename = `relatorio-${key}-${today}`;

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="Gere, exporte e imprima os relatórios financeiros."
        actions={
          <>
            {report && <ExportMenu filename={filename} headers={report.headers} getRows={() => (report.totals ? [...report.rows, report.totals] : report.rows)} disabled={report.rows.length === 0} />}
            <Button variant="outline" onClick={() => window.print()} disabled={!report || report.rows.length === 0}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </>
        }
      />

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setKey(r.key)}
            aria-pressed={key === r.key}
            className={cn("rounded-2xl p-4 text-left transition", key === r.key ? "bg-brand-600 text-white shadow-card" : "bg-white text-ink shadow-card hover:ring-2 hover:ring-brand-200")}
          >
            <p className="text-sm font-bold">{r.label}</p>
            <p className={cn("mt-1 text-xs", key === r.key ? "text-white/80" : "text-muted")}>{r.description}</p>
          </button>
        ))}
      </div>

      {meta.usesRange && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          {RANGES.map((k) => (
            <button key={k} onClick={() => setRangeKey(k)} aria-pressed={rangeKey === k} className={cn("h-9 rounded-full px-3.5 text-[13px] font-semibold transition", rangeKey === k ? "bg-brand-600 text-white" : "bg-white text-muted shadow-card hover:text-ink")}>
              {RANGE_LABEL[k]}
            </button>
          ))}
          {rangeKey === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" className="h-9 w-40" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="Data inicial" />
              <span className="text-sm text-muted">até</span>
              <Input type="date" className="h-9 w-40" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="Data final" />
            </div>
          )}
        </div>
      )}

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}

      {report && (
        <Card>
          <div className="border-b border-line p-5">
            <h2 className="text-lg font-bold">{meta.label}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {meta.usesRange ? `Período: ${formatDate(range.from)} a ${formatDate(range.to)}` : `Posição em ${formatDate(today)}`} · Petrosupply · emitido em {formatDate(today)}
            </p>
          </div>
          {report.rows.length === 0 ? (
            <EmptyState title="Sem registros" text="Nenhum dado encontrado para este relatório e período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-line">
                  <tr>
                    {report.headers.map((h, i) => (
                      <th key={h} className={cn("th", report.numeric.includes(i) && "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} className={cn("td", report.numeric.includes(ci) && "text-right tabular-nums")}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {report.totals && (
                  <tfoot className="border-t-2 border-line bg-page">
                    <tr>
                      {report.totals.map((c, ci) => (
                        <td key={ci} className={cn("td font-bold", report.numeric.includes(ci) && "text-right tabular-nums")}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
