"use client";

import { Plus, Trash2 } from "lucide-react";
import { addDaysISO, formatBRL } from "@/lib/format";
import { applyPercents, fromCents, toCents, type ScheduleRow } from "@/lib/installments";
import { Button, IconButton, Input } from "../ui";

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const num = (v: string) => (v === "" ? NaN : parseFloat(v.replace(",", ".")));

/**
 * Editor do cronograma de parcelas.
 *  - mode "percent": o usuário edita os percentuais (valores são recalculados; a última parcela fecha os centavos).
 *  - mode "amount": o usuário edita os valores; o percentual é apenas informativo.
 */
export function ScheduleEditor({
  total,
  rows,
  onChange,
  mode = "percent",
  target,
}: {
  total: number;
  rows: ScheduleRow[];
  onChange: (rows: ScheduleRow[]) => void;
  mode?: "percent" | "amount";
  /** Valor que a soma das parcelas deve atingir (padrão: o total). */
  target?: number;
}) {
  const goal = target ?? total;
  const sumPercent = round4(rows.reduce((a, r) => a + (Number.isFinite(r.percent) ? r.percent : 0), 0));
  const sumCents = rows.reduce((a, r) => a + toCents(Number.isFinite(r.amount) ? r.amount : 0), 0);
  const okAmount = sumCents === toCents(goal);
  const okPercent = mode === "amount" || sumPercent === 100;

  const update = (i: number, patch: Partial<ScheduleRow>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };

  const setPercent = (i: number, value: number) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, percent: Number.isFinite(value) ? value : 0 } : r));
    onChange(applyPercents(total, next));
  };

  const setAmount = (i: number, value: number) => {
    const amount = Number.isFinite(value) ? value : 0;
    update(i, { amount, percent: total > 0 ? round4((amount / total) * 100) : 0 });
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    onChange([...rows, { label: `${rows.length + 1}ª parcela`, percent: 0, amount: 0, due_date: last ? addDaysISO(last.due_date, 30) : addDaysISO(new Date().toISOString().slice(0, 10), 30) }]);
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-page">
            <tr>
              <th className="th w-[34%]">Parcela</th>
              <th className="th w-[14%]">% do total</th>
              <th className="th w-[22%]">Valor (R$)</th>
              <th className="th w-[24%]">Vencimento</th>
              <th className="th w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <Input value={r.label} onChange={(e) => update(i, { label: e.target.value })} aria-label={`Descrição da parcela ${i + 1}`} className="h-10" />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={Number.isFinite(r.percent) ? r.percent : ""}
                    disabled={mode === "amount"}
                    onChange={(e) => setPercent(i, num(e.target.value))}
                    aria-label={`Percentual da parcela ${i + 1}`}
                    className="h-10"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={Number.isFinite(r.amount) ? r.amount : ""}
                    onChange={(e) => setAmount(i, num(e.target.value))}
                    aria-label={`Valor da parcela ${i + 1}`}
                    className="h-10"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input type="date" value={r.due_date} onChange={(e) => update(i, { due_date: e.target.value })} aria-label={`Vencimento da parcela ${i + 1}`} className="h-10" />
                </td>
                <td className="px-1 py-2">
                  <IconButton disabled={rows.length <= 1 && mode === "percent"} onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remover parcela">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-page">
            <tr>
              <td className="px-4 py-3 text-xs font-semibold uppercase text-muted">Total</td>
              <td className={`px-4 py-3 text-sm font-bold ${okPercent ? "text-brand-600" : "text-red-600"}`}>{mode === "percent" ? `${sumPercent.toLocaleString("pt-BR")}%` : "—"}</td>
              <td className={`px-4 py-3 text-sm font-bold ${okAmount ? "text-brand-600" : "text-red-600"}`}>{formatBRL(fromCents(sumCents))}</td>
              <td colSpan={2} className="px-4 py-3 text-right text-xs text-muted">
                Meta: {formatBRL(goal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" /> Adicionar parcela
        </Button>
        {!(okAmount && okPercent) && (
          <p className="text-xs font-medium text-red-600">
            {!okPercent ? "Os percentuais devem somar 100%. " : ""}
            {!okAmount ? "A soma das parcelas deve ser igual ao valor." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
