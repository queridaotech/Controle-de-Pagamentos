"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Calculator, Pencil, Trash2 } from "lucide-react";
import { fetchAudit, fetchInstallments, fetchPayments, fetchProjects } from "@/lib/data";
import { getSupabase } from "@/lib/supabase/client";
import { useQuery } from "@/lib/hooks";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import { describeAudit } from "@/lib/audit";
import { friendlyError } from "@/lib/utils";
import type { AuditEntry, InstallmentRow } from "@/lib/types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBox, KpiCard, PageHeader, ProgressBar, Spinner } from "@/components/ui";
import { InstallmentsTable } from "@/components/installments-table";
import { PaymentDialog } from "@/components/forms/payment-dialog";
import { InstallmentDialog } from "@/components/forms/installment-dialog";
import { EditProjectDialog, RecalcDialog } from "@/components/forms/project-dialogs";
import { useToast } from "@/components/toast";

export default function ProjetoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useQuery(async () => {
    const [projects, installments, payments] = await Promise.all([fetchProjects(), fetchInstallments(), fetchPayments()]);
    const project = projects.find((p) => p.id === id) ?? null;
    const mine = installments.filter((i) => i.project_id === id);
    const mineIds = new Set(mine.map((i) => i.id));
    const audit: AuditEntry[] = project ? await fetchAudit({ table: "projects", ids: [id] }, 20) : [];
    return { project, installments: mine, payments: payments.filter((p) => mineIds.has(p.installment_id)), audit };
  }, [id]);

  const [paying, setPaying] = useState<InstallmentRow | null>(null);
  const [editInst, setEditInst] = useState<InstallmentRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [recalc, setRecalc] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const instById = useMemo(() => new Map((data?.installments ?? []).map((i) => [i.id, i])), [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data?.project) {
    return (
      <Card>
        <EmptyState title="Projeto não encontrado" action={<Link href="/projetos"><Button variant="outline">Voltar para projetos</Button></Link>} />
      </Card>
    );
  }
  const { project, installments, payments, audit } = data;
  const pct = project.total_value > 0 ? (project.total_received / project.total_value) * 100 : 0;
  const hasPayments = payments.length > 0;

  async function remove() {
    setBusy(true);
    const { error } = await getSupabase().from("projects").delete().eq("id", id);
    setBusy(false);
    setDeleting(false);
    if (error) return toast.error(friendlyError(error));
    toast.ok("Projeto excluído.");
    router.push("/projetos");
  }

  return (
    <>
      <Link href={`/clientes/${project.client_id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {project.client_name}
      </Link>
      <PageHeader
        title={project.project_type}
        subtitle={`${project.client_name} · CNPJ ${formatCNPJ(project.cnpj)} · início ${formatDate(project.start_date)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <Button variant="secondary" onClick={() => setRecalc(true)}>
              <Calculator className="h-4 w-4" /> Alterar valor / recalcular parcelas
            </Button>
            <Button variant="danger" disabled={hasPayments} title={hasPayments ? "Projetos com pagamentos não podem ser excluídos; altere a situação para Cancelado." : undefined} onClick={() => setDeleting(true)}>
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </>
        }
      />

      {project.schedule_diff !== 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            A soma das parcelas ativas difere do valor contratado em <strong>{formatBRL(Math.abs(project.schedule_diff))}</strong> ({project.schedule_diff > 0 ? "acima" : "abaixo"}). Use “Alterar valor / recalcular parcelas” para ajustar o cronograma.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard tone="hero" label="Valor contratado" value={formatBRL(project.total_value)} caption={project.payment_condition_name ?? "Condição personalizada"} />
        <KpiCard label="Valor recebido" value={formatBRL(project.total_received)} caption={`${pct.toFixed(0).replace(".", ",")}% do contrato`} />
        <KpiCard label="Saldo pendente" value={formatBRL(project.total_pending)} caption={`${project.installments_paid}/${project.installments_count} parcelas pagas`} />
        <KpiCard tone="danger" label="Em atraso" value={formatBRL(project.total_overdue)} caption="Vencido e não pago" />
      </div>
      <Card className="mt-4 flex items-center gap-4 p-5">
        <ProgressBar value={pct} className="flex-1" />
        <Badge tone={project.status === "ativo" ? "green" : project.status === "cancelado" ? "red" : "neutral"}>{project.status === "ativo" ? "Ativo" : project.status === "concluido" ? "Concluído" : "Cancelado"}</Badge>
      </Card>
      {project.notes && <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-muted shadow-card">{project.notes}</p>}

      <Card className="mt-4">
        <h2 className="p-5 pb-3 text-[15px] font-bold">Cronograma financeiro</h2>
        {installments.length === 0 ? <EmptyState title="Sem parcelas" /> : <InstallmentsTable rows={installments} showClient={false} showProject={false} onPay={setPaying} onEdit={setEditInst} />}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-bold">Histórico de pagamentos</h2>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold tabular-nums text-brand-600">{formatBRL(p.amount)}</p>
                    <p className="text-xs text-muted">
                      Parcela {instById.get(p.installment_id)?.number} · {formatDate(p.paid_at)}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-bold">Histórico de alterações do projeto</h2>
          {audit.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Sem alterações registradas.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex gap-3 text-muted">
                  <span className="w-32 shrink-0 text-xs tabular-nums">{new Date(a.changed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span>{describeAudit(a)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

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
        projectTotal={project.total_value}
        onClose={() => setEditInst(null)}
        onSaved={() => {
          setEditInst(null);
          void reload();
        }}
      />
      <EditProjectDialog
        project={editing ? project : null}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void reload();
        }}
      />
      <RecalcDialog
        project={recalc ? project : null}
        installments={installments}
        onClose={() => setRecalc(false)}
        onSaved={() => {
          setRecalc(false);
          void reload();
        }}
      />
      <ConfirmDialog open={deleting} title="Excluir projeto?" message="O projeto e todo o seu cronograma de parcelas serão removidos. A exclusão fica registrada no histórico." confirmLabel="Excluir projeto" danger loading={busy} onClose={() => setDeleting(false)} onConfirm={remove} />
    </>
  );
}
