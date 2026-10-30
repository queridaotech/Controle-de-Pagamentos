"use client";

import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { fetchAudit } from "@/lib/data";
import { getSupabase } from "@/lib/supabase/client";
import { formatBRL, formatDate, parseMoney } from "@/lib/format";
import { friendlyError } from "@/lib/utils";
import { describeAudit } from "@/lib/audit";
import { useQuery } from "@/lib/hooks";
import type { AuditEntry, InstallmentRow, PaymentRow } from "@/lib/types";
import { Button, ConfirmDialog, Field, IconButton, Input, Modal, StatusBadge, Textarea } from "../ui";
import { useToast } from "../toast";

/** Edita, cancela ou exclui uma parcela; mostra pagamentos (com estorno) e histórico. */
export function InstallmentDialog({
  installment,
  projectTotal,
  onClose,
  onSaved,
}: {
  installment: InstallmentRow | null;
  projectTotal?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "cancel" | { payment: PaymentRow }>(null);

  const id = installment?.id;
  const payments = useQuery<PaymentRow[]>(async () => {
    if (!id) return [];
    const { data, error } = await getSupabase().from("payments").select("*").eq("installment_id", id).order("paid_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as PaymentRow[];
  }, [id]);

  const history = useQuery<AuditEntry[]>(async () => {
    if (!id) return [];
    const own = await fetchAudit({ table: "installments", ids: [id] }, 30);
    const payIds = (payments.data ?? []).map((p) => p.id);
    const pay = payIds.length ? await fetchAudit({ table: "payments", ids: payIds }, 30) : [];
    return [...own, ...pay].sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  }, [id, payments.data]);

  useEffect(() => {
    if (!installment) return;
    setLabel(installment.label);
    setAmount(installment.amount.toFixed(2).replace(".", ","));
    setDue(installment.due_date);
    setNotes(installment.notes ?? "");
    setError(null);
  }, [installment]);

  if (!installment) return null;
  const canceled = Boolean(installment.canceled_at);

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, okMsg: string, closeAfter = true) {
    setBusy(true);
    setError(null);
    const { error } = await action();
    setBusy(false);
    setConfirm(null);
    if (error) return setError(friendlyError(error));
    toast.ok(okMsg);
    if (closeAfter) onSaved();
    else {
      void payments.reload();
      onSaved();
    }
  }

  async function save() {
    if (!installment) return;
    const value = parseMoney(amount);
    if (!label.trim() || !due) return setError("Preencha descrição e vencimento.");
    if (!Number.isFinite(value) || value < 0) return setError("Valor inválido.");
    if (Math.round(value * 100) < Math.round(installment.paid_amount * 100))
      return setError(`O valor não pode ser menor que o já recebido (${formatBRL(installment.paid_amount)}).`);
    const patch: Record<string, unknown> = { label: label.trim(), amount: value, due_date: due, notes: notes.trim() || null };
    if (projectTotal && projectTotal > 0) patch.percent = Math.round((value / projectTotal) * 1000000) / 10000;
    await run(() => getSupabase().from("installments").update(patch).eq("id", installment.id), "Parcela atualizada.");
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={`Parcela ${installment.number} · ${installment.label}`}
        description={`${installment.client_name} · ${installment.project_type}`}
        footer={
          <>
            {canceled ? (
              <Button variant="secondary" onClick={() => run(() => getSupabase().from("installments").update({ canceled_at: null }).eq("id", installment.id), "Parcela reativada.")}>
                Reativar parcela
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirm("cancel")}>
                Cancelar parcela
              </Button>
            )}
            <Button variant="danger" disabled={installment.paid_amount > 0} title={installment.paid_amount > 0 ? "Parcelas com pagamentos não podem ser excluídas" : undefined} onClick={() => setConfirm("delete")}>
              Excluir
            </Button>
            <span className="flex-1" />
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            <Button loading={busy} onClick={save}>
              Salvar alterações
            </Button>
          </>
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <StatusBadge status={installment.status} />
          <span className="text-sm text-muted">
            Recebido {formatBRL(installment.paid_amount)} · Saldo {formatBRL(installment.balance)}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Descrição">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Valor da parcela (R$)" hint="Alterar o valor pode divergir do total do projeto; o aviso aparece no projeto.">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Vencimento">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

        <h3 className="mb-2 mt-7 text-sm font-bold">Pagamentos registrados</h3>
        {payments.data && payments.data.length > 0 ? (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {payments.data.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="flex-1">
                  <p className="font-semibold">{formatBRL(p.amount)}</p>
                  <p className="text-xs text-muted">
                    {formatDate(p.paid_at)}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <IconButton aria-label="Estornar pagamento" title="Estornar pagamento" onClick={() => setConfirm({ payment: p })}>
                  <Undo2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhum pagamento registrado.</p>
        )}

        <h3 className="mb-2 mt-7 text-sm font-bold">Histórico de alterações</h3>
        {history.data && history.data.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {history.data.map((h) => (
              <li key={`${h.table_name}-${h.id}`} className="flex gap-3 text-muted">
                <span className="w-32 shrink-0 text-xs tabular-nums">{new Date(h.changed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                <span>{describeAudit(h)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Sem alterações registradas.</p>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancelar parcela?"
        message="A parcela deixa de contar como valor a receber e fica marcada como Cancelada. O histórico é mantido e você pode reativá-la depois."
        confirmLabel="Cancelar parcela"
        danger
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => getSupabase().from("installments").update({ canceled_at: new Date().toISOString() }).eq("id", installment.id), "Parcela cancelada.")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Excluir parcela?"
        message="A parcela será removida do cronograma. A exclusão fica registrada no histórico de alterações."
        confirmLabel="Excluir"
        danger
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => getSupabase().from("installments").delete().eq("id", installment.id), "Parcela excluída.")}
      />
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        title="Estornar pagamento?"
        message={
          typeof confirm === "object" && confirm ? `O pagamento de ${formatBRL(confirm.payment.amount)} (${formatDate(confirm.payment.paid_at)}) será removido e o saldo da parcela volta a ficar em aberto. O estorno fica registrado no histórico.` : ""
        }
        confirmLabel="Estornar"
        danger
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (typeof confirm === "object" && confirm) void run(() => getSupabase().from("payments").delete().eq("id", confirm.payment.id), "Pagamento estornado.", false);
        }}
      />
    </>
  );
}
