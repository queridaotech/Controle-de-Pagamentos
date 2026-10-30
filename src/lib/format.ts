/**
 * Formatação no padrão brasileiro: R$ 0.000,00, DD/MM/AAAA, CNPJ.
 * Datas de negócio trafegam como string ISO "AAAA-MM-DD" (sem fuso) para evitar
 * deslocamentos de dia.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number | null | undefined): string {
  return brl.format(value ?? 0);
}

/** "2026-11-01" -> "01/11/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-11" -> "nov/26" */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** "11222333000181" -> "11.222.333/0001-81" */
export function formatCNPJ(value: string | null | undefined): string {
  const d = onlyDigits(value ?? "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Validação do dígito verificador do CNPJ. */
export function isValidCNPJ(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += Number(d[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Converte texto digitado ("1.234,56" ou "1234.56") em número. */
export function parseMoney(input: string): number {
  const s = input.trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}

/** Hoje (data local de Brasília) como "AAAA-MM-DD". */
export function todayISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA => AAAA-MM-DD
}

/** Soma dias a uma data ISO (aritmética em UTC, sem efeito de fuso/horário de verão). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonthISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

export function monthsBetween(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let cur = startOfMonthISO(fromISO);
  const end = startOfMonthISO(toISO);
  while (cur <= end) {
    out.push(cur.slice(0, 7));
    cur = addMonthsISO(cur, 1);
  }
  return out;
}
