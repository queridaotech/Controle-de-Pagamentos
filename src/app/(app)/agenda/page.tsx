"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, HandCoins } from "lucide-react";
import { fetchInstallments } from "@/lib/data";
import { useQuery } from "@/lib/hooks";
import { addMonthsISO, endOfMonthISO, formatBRL, formatDate, startOfMonthISO, todayISO } from "@/lib/format";
import { STATUS_STYLE } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { InstallmentRow } from "@/lib/types";
import { Card, EmptyState, ErrorBox, IconButton, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { PaymentDialog } from "@/components/forms/payment-dialog";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export default function AgendaPage() {
  const today = todayISO();
  const { data, error, loading, reload } = useQuery(fetchInstallments);
  const [month, setMonth] = useState(startOfMonthISO(today));
  const [selected, setSelected] = useState<string>(today);
  const [paying, setPaying] = useState<InstallmentRow | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, InstallmentRow[]>();
    (data ?? []).forEach((i) => {
      if (i.status === "cancelado") return;
      const list = m.get(i.due_date) ?? [];
      list.push(i);
      m.set(i.due_date, list);
    });
    return m;
  }, [data]);

  const cells = useMemo(() => {
    const first = new Date(`${month}T00:00:00Z`);
    const lead = first.getUTCDay();
    const last = Number(endOfMonthISO(month).slice(8));
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= last; d++) out.push(`${month.slice(0, 7)}-${String(d).padStart(2, "0")}`);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  const monthStats = useMemo(() => {
    const list = (data ?? []).filter((i) => i.status !== "cancelado" && i.due_date.startsWith(month.slice(0, 7)));
    return {
      toReceive: list.reduce((a, i) => a + i.balance, 0),
      received: list.reduce((a, i) => a + i.paid_amount, 0),
      overdue: list.filter((i) => i.is_overdue).reduce((a, i) => a + i.balance, 0),
    };
  }, [data, month]);

  const upcoming = useMemo(
    () =>
      (data ?? [])
        .filter((i) => i.status !== "cancelado" && i.balance > 0 && i.due_date >= today)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.client_name.localeCompare(b.client_name, "pt-BR"))
        .slice(0, 12),
    [data, today],
  );
  const overdueCount = (data ?? []).filter((i) => i.is_overdue).length;
  const dayList = byDay.get(selected) ?? [];

  const monthLabel = `${MONTHS[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;

  return (
    <>
      <PageHeader title="Agenda Financeira" subtitle="Calendário de vencimentos, valores previstos, pagamentos realizados e atrasos." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}

      {data && (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <IconButton onClick={() => setMonth(startOfMonthISO(addMonthsISO(month, -1)))} aria-label="Mês anterior">
                  <ChevronLeft className="h-5 w-5" />
                </IconButton>
                <h2 className="min-w-[190px] text-center text-lg font-bold">{monthLabel}</h2>
                <IconButton onClick={() => setMonth(startOfMonthISO(addMonthsISO(month, 1)))} aria-label="Próximo mês">
                  <ChevronRight className="h-5 w-5" />
                </IconButton>
              </div>
              <button
                onClick={() => {
                  setMonth(startOfMonthISO(today));
                  setSelected(today);
                }}
                className="rounded-full bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-100"
              >
                Hoje
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-page p-3">
                <p className="text-[11px] font-semibold uppercase text-muted">A receber no mês</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums">{formatBRL(monthStats.toReceive)}</p>
              </div>
              <div className="rounded-2xl bg-brand-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-brand-600">Recebido</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-brand-600">{formatBRL(monthStats.received)}</p>
              </div>
              <div className="rounded-2xl bg-red-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-red-700">Em atraso</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-red-700">{formatBRL(monthStats.overdue)}</p>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-2">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((iso, idx) => {
                if (!iso) return <div key={idx} className="min-h-[76px] rounded-xl bg-page/50 sm:min-h-[92px]" />;
                const items = byDay.get(iso) ?? [];
                const open = items.reduce((a, i) => a + i.balance, 0);
                const statuses = [...new Set(items.map((i) => i.status))];
                const isSel = iso === selected;
                const isToday = iso === today;
                return (
                  <button
                    key={iso}
                    onClick={() => setSelected(iso)}
                    aria-label={`${formatDate(iso)}: ${items.length} parcela(s)`}
                    aria-pressed={isSel}
                    className={cn(
                      "flex min-h-[76px] flex-col items-start rounded-xl border p-1.5 text-left transition sm:min-h-[92px] sm:p-2",
                      isSel ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-line bg-white hover:border-brand-300",
                    )}
                  >
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", isToday ? "bg-brand-600 text-white" : "text-ink")}>{Number(iso.slice(8))}</span>
                    {items.length > 0 && (
                      <>
                        <span className="mt-1 flex flex-wrap gap-0.5">
                          {statuses.map((s) => (
                            <span key={s} className={cn("h-2 w-2 rounded-full", STATUS_STYLE[s].dot)} />
                          ))}
                        </span>
                        <span className="mt-auto hidden text-[11px] font-semibold tabular-nums text-ink sm:block">{open > 0 ? `R$ ${compact.format(open)}` : "Quitado"}</span>
                        <span className="mt-auto text-[10px] font-semibold text-muted sm:hidden">{items.length}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
              {(["a_vencer", "vence_hoje", "atrasado", "parcial", "pago"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", STATUS_STYLE[s].dot)} />
                  {{ a_vencer: "A vencer (previsto)", vence_hoje: "Vence hoje", atrasado: "Atrasado", parcial: "Pago parcialmente", pago: "Pago" }[s]}
                </span>
              ))}
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="text-[15px] font-bold">{formatDate(selected)}</h2>
              <p className="text-xs text-muted">{dayList.length} parcela(s) com vencimento neste dia</p>
              {dayList.length === 0 ? (
                <p className="mt-4 text-sm text-muted">Nenhum vencimento nesta data.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {dayList.map((i) => (
                    <li key={i.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link href={`/clientes/${i.client_id}`} className="block truncate text-sm font-semibold hover:text-brand-600">
                          {i.client_name}
                        </Link>
                        <Link href={`/projetos/${i.project_id}`} className="text-xs text-muted hover:text-brand-600">
                          {i.project_type} · parcela {i.number} ({i.label})
                        </Link>
                        <div className="mt-1.5">
                          <StatusBadge status={i.status} />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-bold tabular-nums">{formatBRL(i.amount)}</span>
                        {i.balance > 0 && (
                          <IconButton onClick={() => setPaying(i)} aria-label="Registrar pagamento" title="Registrar pagamento" className="h-8 w-8 text-brand-500 hover:bg-brand-50">
                            <HandCoins className="h-[18px] w-[18px]" />
                          </IconButton>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-[15px] font-bold">Próximos vencimentos</h2>
              {overdueCount > 0 && (
                <Link href="/pagamentos" className="mt-2 block rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
                  {overdueCount} parcela(s) em atraso — ver no controle de pagamentos
                </Link>
              )}
              {upcoming.length === 0 ? (
                <EmptyState title="Nada a vencer" text="Não há parcelas em aberto com vencimento futuro." />
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {upcoming.map((i) => (
                    <li key={i.id}>
                      <button onClick={() => { setSelected(i.due_date); setMonth(startOfMonthISO(i.due_date)); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2.5 text-left hover:bg-page">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{i.client_name}</p>
                          <p className="text-xs text-muted">
                            {formatDate(i.due_date)} · {i.project_type}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums">{formatBRL(i.balance)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      <PaymentDialog
        installment={paying}
        onClose={() => setPaying(null)}
        onSaved={() => {
          setPaying(null);
          void reload();
        }}
      />
    </>
  );
}
