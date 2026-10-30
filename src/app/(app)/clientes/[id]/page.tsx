"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Pencil, Phone, Plus } from "lucide-react";
import { fetchClients, fetchConditions, fetchInstallments, fetchPayments, fetchProjects } from "@/lib/data";
import { useQuery } from "@/lib/hooks";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import type { InstallmentRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, ErrorBox, KpiCard, PageHeader, ProgressBar, Spinner } from "@/components/ui";
import { InstallmentsTable } from "@/components/installments-table";
import { ClientDialog } from "@/components/forms/client-dialog";
import { PaymentDialog } from "@/components/forms/payment-dialog";
import { InstallmentDialog } from "@/components/forms/installment-dialog";
import { ProjectDialog } from "@/components/forms/project-dialogs";

type Tab = "todas" | "abertas" | "atrasadas" | "pagas";

export default function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useQuery(async () => {
    const [clients, projects, installments, payments, conditions] = await Promise.all([fetchClients(), fetchProjects(), fetchInstallments(), fetchPayments(), fetchConditions()]);
    return { clients, projects, installments, payments, conditions };
  }, [id]);

  const [tab, setTab] = useState<Tab>("abertas");
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [paying, setPaying] = useState<InstallmentRow | null>(null);
  const [editInst, setEditInst] = useState<InstallmentRow | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const client = data.clients.find((c) => c.id === id);
    const projects = data.projects.filter((p) => p.client_id === id);
    const installments = data.installments.filter((i) => i.client_id === id);
    const instIds = new Set(installments.map((i) => i.id));
    const instById = new Map(installments.map((i) => [i.id, i]));
    const payments = data.payments.filter((p) => instIds.has(p.installment_id));
    return { client, projects, installments, payments, instById };
  }, [data, id]);

  const filtered = useMemo(() => {
    if (!view) return [];
    const list = view.installments;
    switch (tab) {
      case "abertas":
        return list.filter((i) => i.status !== "pago" && i.status !== "cancelado");
      case "atrasadas":
        return list.filter((i) => i.is_overdue);
      case "pagas":
        return list.filter((i) => i.status === "pago");
      default:
        return list;
    }
  }, [view, tab]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!view?.client || !data) {
    return (
      <Card>
        <EmptyState title="Cliente não encontrado" action={<Link href="/clientes"><Button variant="outline">Voltar para clientes</Button></Link>} />
      </Card>
    );
  }
  const { client, projects, installments, payments, instById } = view;
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "abertas", label: "Em aberto", count: installments.filter((i) => i.status !== "pago" && i.status !== "cancelado").length },
    { key: "atrasadas", label: "Atrasadas", count: installments.filter((i) => i.is_overdue).length },
    { key: "pagas", label: "Pagas", count: installments.filter((i) => i.status === "pago").length },
    { key: "todas", label: "Todas", count: installments.length },
  ];
  const projectTotal = (pid: string) => projects.find((p) => p.id === pid)?.total_value;

  return (
    <>
      <Link href="/clientes" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>
      <PageHeader
        title={client.name}
        subtitle={`CNPJ ${formatCNPJ(client.cnpj)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar dados
            </Button>
            <Button onClick={() => setNewProject(true)}>
              <Plus className="h-4 w-4" /> Novo projeto
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard tone="hero" label="Total contratado" value={formatBRL(client.total_contracted)} caption={`${client.projects_count} projeto(s)`} />
        <KpiCard label="Total recebido" value={formatBRL(client.total_received)} caption={`${installments.filter((i) => i.status === "pago").length} parcela(s) paga(s)`} />
        <KpiCard label="Saldo pendente" value={formatBRL(client.total_pending)} caption={`${installments.filter((i) => i.status !== "pago" && i.status !== "cancelado").length} parcela(s) em aberto`} />
        <KpiCard tone="danger" label="Em atraso" value={formatBRL(client.total_overdue)} caption={`${installments.filter((i) => i.is_overdue).length} parcela(s) atrasada(s)`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="text-[15px] font-bold">Dados cadastrais</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase text-muted">Razão social</dt>
              <dd className="mt-0.5 font-medium">{client.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted">CNPJ</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatCNPJ(client.cnpj)}</dd>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Mail className="h-4 w-4" /> {client.email || "—"}
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Phone className="h-4 w-4" /> {client.phone || "—"}
            </div>
            {client.notes && <p className="rounded-xl bg-page p-3 text-muted">{client.notes}</p>}
          </dl>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="text-[15px] font-bold">Projetos contratados</h2>
          {projects.length === 0 ? (
            <EmptyState title="Nenhum projeto ainda" text="Crie um projeto para gerar o cronograma de pagamentos." action={<Button onClick={() => setNewProject(true)}>Novo projeto</Button>} />
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {projects.map((p) => {
                const pct = p.total_value > 0 ? (p.total_received / p.total_value) * 100 : 0;
                return (
                  <li key={p.id}>
                    <Link href={`/projetos/${p.id}`} className="block rounded-xl px-2 py-3.5 transition hover:bg-brand-50/50">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">
                          {p.project_type}{" "}
                          <Badge tone={p.status === "ativo" ? "green" : p.status === "cancelado" ? "red" : "neutral"}>{p.status === "ativo" ? "Ativo" : p.status === "concluido" ? "Concluído" : "Cancelado"}</Badge>
                        </p>
                        <p className="text-sm font-semibold tabular-nums">{formatBRL(p.total_value)}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        Início {formatDate(p.start_date)} · {p.payment_condition_name ?? "Condição personalizada"}
                      </p>
                      <div className="mt-2.5 flex items-center gap-3">
                        <ProgressBar value={pct} className="flex-1" />
                        <span className="w-44 shrink-0 text-right text-xs text-muted">
                          recebido {formatBRL(p.total_received)} · saldo {formatBRL(p.total_pending)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <h2 className="text-[15px] font-bold">Parcelas</h2>
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
                className={cn("h-9 rounded-full px-3.5 text-[13px] font-semibold transition", tab === t.key ? "bg-brand-600 text-white" : "bg-page text-muted hover:text-ink")}
              >
                {t.label} <span className="opacity-70">({t.count})</span>
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="Nenhuma parcela nesta visão" />
        ) : (
          <InstallmentsTable rows={filtered} showClient={false} onPay={setPaying} onEdit={setEditInst} />
        )}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-[15px] font-bold">Histórico de pagamentos</h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum pagamento registrado para este cliente.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">Data</th>
                  <th className="th">Projeto</th>
                  <th className="th">Parcela</th>
                  <th className="th text-right">Valor</th>
                  <th className="th">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.map((p) => {
                  const inst = instById.get(p.installment_id);
                  return (
                    <tr key={p.id}>
                      <td className="td tabular-nums">{formatDate(p.paid_at)}</td>
                      <td className="td">{inst?.project_type}</td>
                      <td className="td text-muted">
                        {inst?.number} · {inst?.label}
                      </td>
                      <td className="td text-right font-semibold tabular-nums text-brand-600">{formatBRL(p.amount)}</td>
                      <td className="td text-muted">{p.notes ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ClientDialog
        open={editing}
        client={client}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void reload();
        }}
      />
      <ProjectDialog
        open={newProject}
        defaultClientId={client.id}
        clients={[{ id: client.id, name: client.name, cnpj: client.cnpj }]}
        conditions={data.conditions}
        onClose={() => setNewProject(false)}
        onSaved={() => {
          setNewProject(false);
          void reload();
        }}
      />
      <PaymentDialog
        installment={paying}
        onClose={() => setPaying(null)}
        onSaved={() => {
          setPaying(null);
          void reload();
        }}
      />
      <InstallmentDialog
        installment={editInst}
        projectTotal={editInst ? projectTotal(editInst.project_id) : undefined}
        onClose={() => setEditInst(null)}
        onSaved={() => {
          setEditInst(null);
          void reload();
        }}
      />
    </>
  );
}
