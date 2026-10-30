import { addDaysISO } from "./format";

/**
 * Geração e validação de cronogramas de parcelas.
 * Todo cálculo é feito em CENTAVOS (inteiros) para evitar erros de ponto flutuante;
 * a última parcela absorve o resto do arredondamento, garantindo que a soma das
 * parcelas seja exatamente igual ao valor contratado.
 */

export interface ConditionItem {
  label: string;
  percent: number;
  /** dias após o vencimento do sinal (1ª parcela) */
  offset_days: number;
}

export interface ScheduleRow {
  label: string;
  percent: number;
  amount: number;
  due_date: string; // AAAA-MM-DD
}

export const toCents = (value: number) => Math.round(value * 100);
export const fromCents = (cents: number) => cents / 100;

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Distribui `totalCents` conforme percentuais; o resto cai na última parcela. */
export function splitCents(totalCents: number, percents: number[]): number[] {
  const parts = percents.map((p) => Math.round((totalCents * p) / 100));
  if (parts.length === 0) return parts;
  const sumPercent = round4(percents.reduce((a, b) => a + b, 0));
  if (sumPercent === 100) {
    const others = parts.slice(0, -1).reduce((a, b) => a + b, 0);
    parts[parts.length - 1] = totalCents - others;
  }
  return parts;
}

export function generateSchedule(total: number, firstDueDate: string, items: ConditionItem[]): ScheduleRow[] {
  const amounts = splitCents(
    toCents(total),
    items.map((i) => i.percent),
  );
  return items.map((item, idx) => ({
    label: item.label,
    percent: item.percent,
    amount: fromCents(amounts[idx]),
    due_date: addDaysISO(firstDueDate, item.offset_days),
  }));
}

/** Recalcula os valores a partir dos percentuais (usado ao editar % na tela). */
export function applyPercents(total: number, rows: ScheduleRow[]): ScheduleRow[] {
  const amounts = splitCents(
    toCents(total),
    rows.map((r) => r.percent),
  );
  return rows.map((r, i) => ({ ...r, amount: fromCents(amounts[i]) }));
}

export interface ScheduleCheck {
  ok: boolean;
  errors: string[];
  sumPercent: number;
  sumAmount: number;
}

export function validateSchedule(total: number, rows: ScheduleRow[]): ScheduleCheck {
  const errors: string[] = [];
  const sumPercent = round4(rows.reduce((a, r) => a + (Number.isFinite(r.percent) ? r.percent : 0), 0));
  const sumCents = rows.reduce((a, r) => a + toCents(Number.isFinite(r.amount) ? r.amount : 0), 0);

  if (rows.length === 0) errors.push("Inclua ao menos uma parcela.");
  if (sumPercent !== 100) errors.push(`A soma dos percentuais deve ser 100% (atual: ${sumPercent.toLocaleString("pt-BR")}%).`);
  if (sumCents !== toCents(total)) {
    errors.push("A soma das parcelas deve ser igual ao valor do projeto.");
  }
  if (rows.some((r) => !r.due_date)) errors.push("Informe a data de vencimento de todas as parcelas.");
  if (rows.some((r) => !(r.amount >= 0))) errors.push("Há parcelas com valor inválido.");

  return { ok: errors.length === 0, errors, sumPercent, sumAmount: fromCents(sumCents) };
}
