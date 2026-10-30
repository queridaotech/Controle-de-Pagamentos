"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchInstallments, fetchProjects } from "@/lib/data";
import { useQuery, usePagination } from "@/lib/hooks";
import { addDaysISO, formatBRL, formatCNPJ, formatDate, onlyDigits, todayISO } from "@/lib/format";
import { ALL_STATUSES, STATUS_LABEL } from "@/lib/status";
import { normalize, cn } from "@/lib/utils";
import { PROJECT_TYPES, type InstallmentRow, type InstallmentStatus } from "@/lib/types";
import { Card, EmptyState, ErrorBox, Input, PageHeader, Pagination, Select, Spinner } from "@/components/ui";
import { InstallmentsTable } from "@/components/installments-table";
import { PaymentDialog } from "@/components/forms/payment-dialog";
import { InstallmentDialog } from "@/components/forms/installment-dialog";
import { ExportMenu } from "@/components/export-menu";

type Quick = "todos" | "atrasados" | "7" | "15" | "30";
const QUICK: { key: Quick; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "atrasados", label: "Atrasados" },
  { key: "7", label: "Próx. 7 dias" },
  { key: "15", label: "Próx. 15 dias" },
  { key: "30", label: "Próx. 30 dias" },
];

export default function PagamentosPage() {
  const today = todayISO();
  const { data, error, loading, reload } = useQuery(async () => {
    const [installments, projects] = await Promise.all([fetchInstallments(), fetchProjects()]);
    return { installments, totals: new Map(projects.map((p) => [p.id, p.total_value])) };
  });

  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectType, setProjectType] = useState("");
  const [status, setStatus] = useState<"" | InstallmentStatus>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quick, setQuick] = useState<Quick>("todos");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [paying, setPaying] = useState<InstallmentRow | null>(null);
  const [editing, setEditing] = useState<InstallmentRow | null>(null);

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    (data?.installments ?? []).forEach((i) => m.set(i.client_id, i.client_name));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [data]);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const digits = onlyDigits(search);
    const horizon = quick === "7" || quick === "15" || quick === "30" ? addDaysISO(today, Number(quick)) : null;
    const rows = (data?.installments ?? []).filter((i) => {
      if (q && !(normalize(i.client_name).includes(q) || (digits.length > 0 && i.cnpj.includes(digits)))) return false;
      if (clientId && i.client_id !== clientId) return false;
      if (projectType && i.project_type !== projectType) return false;
      if (status && i.status !== status) return false;
      if (from && i.due_date < from) return false;
      if (to && i.due_date > to) return false;
      if (quick === "atrasados" && !i.is_overdue) return false;
      if (horizon && !(i.balance > 0 && i.status !== "cancelado" && i.due_date >= today && i.due_date <= horizon)) return false;
      return true;
    });
    rows.sort((a, b) => (sort === "asc" ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date)) || a.client_name.localeCompare(b.client_name, "pt-BR") || a.number - b.number);
    return rows;
  }, [data, search, clientId, projectType, status, from, to, quick, sort, today]);

  const pg = usePagination(filtered, 20);
  const totals = useMemo(
    () => ({
      amount: filtered.filter((i) => i.status !== "cancelado").reduce((a, i) => a + i.amount, 0),
      paid: filtered.reduce((a, i) => a + i.paid_amount, 0),
      balance: filtered.reduce((a, i) => a + i.balance, 0),
    }),
    [filtered],
  );

  const reset = () => {
    setSearch("");
    setClientId("");
    setProjectType("");
    setStatus("");
    setFrom("");
    setTo("");
    setQuick("todos");
  };
  const hasFilters = search || clientId || projectType || status || from || to || quick !== "todos";

  return (
    <>
      <PageHeader
        title="Controle de Pagamentos"
        subtitle="Todas as parcelas de todos os clientes e projetos em uma única tela."
        actions={
          <ExportMenu
            filename="controle-de-pagamentos"
            headers={["Cliente", "CNPJ", "Projeto", "Parcela", "Valor da parcela", "Vencimento", "Data do pagamento", "Valor recebido", "Status", "Forma de pagamento", "Observações"]}
            getRows={() =>
              filtered.map((i) => [i.client_name, formatCNPJ(i.cnpj), i.project_type, `${i.number} - ${i.label}`, formatBRL(i.amount), formatDate(i.due_date), i.paid_at ? formatDate(i.paid_at) : "", formatBRL(i.paid_amount), STATUS_LABEL[i.status], i.payment_condition_name ?? "Personalizada", i.notes ?? ""])
            }
            disabled={filtered.length === 0}
          />
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q.key}
            onClick={() => setQuick(q.key)}
            aria-pressed={quick === q.key}
            className={cn(
              "h-10 rounded-full px-4 text-sm font-semibold transition",
              quick === q.key ? (q.key === "atrasados" ? "bg-red-600 text-white" : "bg-brand-600 text-white shadow-sm") : "bg-white text-muted shadow-card hover:text-ink",
            )}
          >
            {q.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 xl:grid-cols-6">
          <div className="relative sm:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou CNPJ" className="pl-10" aria-label="Buscar por cliente ou CNPJ" />
          </div>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Filtrar por cliente">
            <option value="">Todos os clientes</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          <Select value={projectType} onChange={(e) => setProjectType(e.target.value)} aria-label="Filtrar por projeto">
            <option value="">Todos os projetos</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as "" | InstallmentStatus)} aria-label="Filtrar por status">
            <option value="">Todos os status</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-6">
            <span className="text-sm text-muted">Vencimento de</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" aria-label="Vencimento inicial" />
            <span className="text-sm text-muted">até</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" aria-label="Vencimento final" />
            {hasFilters && (
              <button onClick={reset} className="ml-auto text-sm font-semibold text-brand-600 hover:underline">
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-line text-center sm:grid-cols-4">
          {[
            ["Parcelas", String(filtered.length)],
            ["Valor das parcelas", formatBRL(totals.amount)],
            ["Recebido", formatBRL(totals.paid)],
            ["Saldo em aberto", formatBRL(totals.balance)],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-muted">{label}</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        )}
        {loading && !data && <Spinner />}
        {data && filtered.length === 0 && (
          <EmptyState title={data.installments.length === 0 ? "Nenhuma parcela cadastrada" : "Nenhuma parcela encontrada"} text={data.installments.length === 0 ? "As parcelas aparecem aqui assim que você criar o primeiro projeto." : "Ajuste os filtros para ver outros pagamentos."} />
        )}
        {filtered.length > 0 && (
          <>
            <InstallmentsTable rows={pg.slice} sort={sort} onSort={() => setSort((s) => (s === "asc" ? "desc" : "asc"))} onPay={setPaying} onEdit={setEditing} />
            <Pagination {...pg} onPage={pg.setPage} />
          </>
        )}
      </Card>

      <PaymentDialog
        installment={paying}
        onClose={() => setPaying(null)}
        onSaved={() => {
          setPaying(null);
          void reload();
        }}
      />
      <InstallmentDialog
        installment={editing}
        projectTotal={editing ? data?.totals.get(editing.project_id) : undefined}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
    </>
  );
}
