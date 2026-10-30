"use client";

import { useEffect, useState } from "react";
import { rpc } from "@/lib/data";
import { formatBRL, formatDate, parseMoney, todayISO } from "@/lib/format";
import { friendlyError } from "@/lib/utils";
import type { InstallmentRow } from "@/lib/types";
import { Button, Field, Input, Modal, Textarea } from "../ui";
import { useToast } from "../toast";

export type PayableInstallment = Pick<
  InstallmentRow,
  "id" | "client_name" | "project_type" | "number" | "label" | "amount" | "paid_amount" | "balance" | "due_date"
>;

/** Registra recebimento total ou parcial de uma parcela. */
export function PaymentDialog({
  installment,
  onClose,
  onSaved,
}: {
  installment: PayableInstallment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!installment) return;
    setAmount(installment.balance.toFixed(2).replace(".", ","));
    setDate(todayISO());
    setNotes("");
    setError(null);
  }, [installment]);

  if (!installment) return null;
  const value = parseMoney(amount);
  const isPartial = Number.isFinite(value) && value < installment.balance;

  async function save() {
    if (!installment) return;
    if (!Number.isFinite(value) || value <= 0) return setError("Informe um valor maior que zero.");
    if (Math.round(value * 100) > Math.round(installment.balance * 100)) return setError(`O valor excede o saldo da parcela (${formatBRL(installment.balance)}).`);
    if (!date || date > todayISO()) return setError("A data do recebimento não pode ser futura.");
    setBusy(true);
    setError(null);
    try {
      await rpc("register_payment", { p_installment_id: installment.id, p_amount: value, p_paid_at: date, p_notes: notes || null });
      toast.ok(isPartial ? "Pagamento parcial registrado." : "Pagamento registrado.");
      onSaved();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar pagamento"
      description={`${installment.client_name} · ${installment.project_type} · parcela ${installment.number} (${installment.label})`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            {isPartial ? "Registrar parcial" : "Registrar pagamento"}
          </Button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-3 rounded-2xl bg-page p-4 text-center">
        <div>
          <p className="text-[11px] font-semibold uppercase text-muted">Parcela</p>
          <p className="mt-1 text-sm font-bold">{formatBRL(installment.amount)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase text-muted">Já recebido</p>
          <p className="mt-1 text-sm font-bold text-brand-600">{formatBRL(installment.paid_amount)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase text-muted">Saldo</p>
          <p className="mt-1 text-sm font-bold">{formatBRL(installment.balance)}</p>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted">Vencimento: {formatDate(installment.due_date)}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor recebido (R$)" hint={isPartial ? "Pagamento parcial: o saldo continua em aberto." : undefined}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label="Data efetiva do recebimento">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: transferência TED, comprovante nº…" />
        </Field>
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}
