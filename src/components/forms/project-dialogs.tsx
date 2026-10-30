"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/data";
import { addDaysISO, formatBRL, formatCNPJ, formatDate, parseMoney, todayISO } from "@/lib/format";
import { applyPercents, fromCents, generateSchedule, splitCents, toCents, validateSchedule, type ScheduleRow } from "@/lib/installments";
import { friendlyError } from "@/lib/utils";
import { PROJECT_TYPES, type InstallmentRow, type PaymentCondition, type ProjectRow, type ProjectType } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "../ui";
import { useToast } from "../toast";
import { ScheduleEditor } from "./schedule-editor";

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const CUSTOM = "custom";

/* ===========================================================================
 * Novo projeto: dados comerciais + cronograma de parcelas gerado automaticamente
 * ========================================================================= */
export function ProjectDialog({
  open,
  onClose,
  onSaved,
  clients,
  conditions,
  defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (projectId: string) => void;
  clients: { id: string; name: string; cnpj: string }[];
  conditions: PaymentCondition[];
  defaultClientId?: string;
}) {
  const toast = useToast();
  const activeConditions = useMemo(() => conditions.filter((c) => c.active), [conditions]);

  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<ProjectType>(PROJECT_TYPES[0]);
  const [startDate, setStartDate] = useState(todayISO());
  const [firstDue, setFirstDue] = useState(todayISO());
  const [firstDueTouched, setFirstDueTouched] = useState(false);
  const [totalText, setTotalText] = useState("");
  const [conditionId, setConditionId] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = parseMoney(totalText);
  const totalNum = Number.isFinite(total) && total > 0 ? total : 0;

  // reset ao abrir
  useEffect(() => {
    if (!open) return;
    setClientId(defaultClientId ?? "");
    setType(PROJECT_TYPES[0]);
    setStartDate(todayISO());
    setFirstDue(todayISO());
    setFirstDueTouched(false);
    setTotalText("");
    setNotes("");
    setError(null);
    setConditionId(activeConditions[0]?.id ?? CUSTOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // o vencimento do sinal acompanha a data de início até o usuário alterá-lo
  useEffect(() => {
    if (!firstDueTouched) setFirstDue(startDate);
  }, [startDate, firstDueTouched]);

  // gera o cronograma sempre que valor, 1º vencimento ou condição mudam
  useEffect(() => {
    if (!open || !conditionId) return;
    if (conditionId === CUSTOM) {
      setRows((cur) => (cur.length ? applyPercents(totalNum, cur) : [{ label: "Sinal", percent: 100, amount: totalNum, due_date: firstDue }]));
      return;
    }
    const cond = activeConditions.find((c) => c.id === conditionId);
    if (cond) setRows(generateSchedule(totalNum, firstDue, cond.items));
  }, [open, conditionId, totalNum, firstDue, activeConditions]);

  async function save() {
    setError(null);
    if (!clientId) return setError("Selecione o cliente.");
    if (!totalNum) return setError("Informe o valor total do projeto.");
    const check = validateSchedule(totalNum, rows);
    if (!check.ok) return setError(check.errors.join(" "));
    setBusy(true);
    try {
      const id = await rpc<string>("create_project", {
        p_client_id: clientId,
        p_project_type: type,
        p_start_date: startDate,
        p_total_value: totalNum,
        p_first_due_date: firstDue,
        p_payment_condition_id: conditionId === CUSTOM ? null : conditionId,
        p_notes: notes.trim() || null,
        p_installments: rows.map((r) => ({ label: r.label.trim() || "Parcela", percent: r.percent, amount: r.amount, due_date: r.due_date })),
      });
      toast.ok("Projeto criado e parcelas geradas.");
      onSaved(id);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Novo projeto"
      description="As parcelas são geradas automaticamente e podem ser ajustadas antes de confirmar."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            Confirmar e gerar parcelas
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Cliente" className="md:col-span-2">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecione…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {formatCNPJ(c.cnpj)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Projeto">
          <Select value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
            {PROJECT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Data de início">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Valor total (R$)">
          <Input value={totalText} onChange={(e) => setTotalText(e.target.value)} inputMode="decimal" placeholder="10.000,00" />
        </Field>
        <Field label="Vencimento do sinal / 1ª parcela">
          <Input
            type="date"
            value={firstDue}
            onChange={(e) => {
              setFirstDue(e.target.value);
              setFirstDueTouched(true);
            }}
          />
        </Field>
        <Field label="Forma de pagamento" className="md:col-span-3">
          <Select value={conditionId} onChange={(e) => setConditionId(e.target.value)}>
            {activeConditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.items.map((i) => `${i.percent}%`).join(" + ")}
              </option>
            ))}
            <option value={CUSTOM}>Personalizada (definir parcelas manualmente)</option>
          </Select>
        </Field>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-bold">Cronograma de parcelas</h3>
      <ScheduleEditor total={totalNum} rows={rows} onChange={setRows} mode="percent" />

      <Field label="Observações" className="mt-5">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}

/* ===========================================================================
 * Editar dados do projeto (tipo, datas informativas, situação, observações)
 * ========================================================================= */
export function EditProjectDialog({ project, onClose, onSaved }: { project: ProjectRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<ProjectType>(PROJECT_TYPES[0]);
  const [status, setStatus] = useState<ProjectRow["status"]>("ativo");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setType(project.project_type);
    setStatus(project.status);
    setStartDate(project.start_date);
    setNotes(project.notes ?? "");
    setError(null);
  }, [project]);

  if (!project) return null;

  async function save() {
    if (!project) return;
    setBusy(true);
    const { error } = await getSupabase()
      .from("projects")
      .update({ project_type: type, status, start_date: startDate, notes: notes.trim() || null })
      .eq("id", project.id);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    toast.ok("Projeto atualizado.");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Editar projeto"
      description={`${project.client_name} · valor ${formatBRL(project.total_value)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Projeto">
          <Select value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
            {PROJECT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Situação">
          <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectRow["status"])}>
            <option value="ativo">Ativo</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </Select>
        </Field>
        <Field label="Data de início">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <p className="mt-4 text-xs text-muted">Para alterar o valor do projeto e recalcular as parcelas, use “Alterar valor / recalcular parcelas” na página do projeto.</p>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}

/* ===========================================================================
 * Alterar valor do projeto e recalcular parcelas pendentes (com confirmação)
 * Parcelas com pagamentos e parcelas canceladas são preservadas (histórico).
 * ========================================================================= */
export function RecalcDialog({
  project,
  installments,
  onClose,
  onSaved,
}: {
  project: ProjectRow | null;
  installments: InstallmentRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [totalText, setTotalText] = useState("");
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kept = useMemo(() => installments.filter((i) => i.canceled_at || i.paid_amount > 0), [installments]);
  const pending = useMemo(() => installments.filter((i) => !i.canceled_at && i.paid_amount === 0), [installments]);
  const keptSumCents = kept.filter((i) => !i.canceled_at).reduce((a, i) => a + toCents(i.amount), 0);

  const newTotal = parseMoney(totalText);
  const newTotalNum = Number.isFinite(newTotal) && newTotal > 0 ? newTotal : 0;
  const remainingCents = toCents(newTotalNum) - keptSumCents;

  useEffect(() => {
    if (project) {
      setTotalText(project.total_value.toFixed(2).replace(".", ","));
      setError(null);
    }
  }, [project]);

  // redistribui o saldo restante proporcionalmente às parcelas pendentes atuais
  useEffect(() => {
    if (!project) return;
    if (remainingCents <= 0) return setRows([]);
    if (pending.length === 0) {
      return setRows([{ label: "Parcela", percent: 0, amount: fromCents(remainingCents), due_date: addDaysISO(todayISO(), 30) }]);
    }
    const weights = pending.map((p) => p.amount);
    const sumW = weights.reduce((a, b) => a + b, 0) || 1;
    const amounts = splitCents(remainingCents, weights.map((w) => (w / sumW) * 100));
    // garante fechamento exato mesmo com pesos fracionários
    const diff = remainingCents - amounts.reduce((a, b) => a + b, 0);
    amounts[amounts.length - 1] += diff;
    setRows(
      pending.map((p, i) => ({
        label: p.label,
        percent: newTotalNum ? round4((fromCents(amounts[i]) / newTotalNum) * 100) : 0,
        amount: fromCents(amounts[i]),
        due_date: p.due_date,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, newTotalNum]);

  if (!project) return null;
  const rowsCents = rows.reduce((a, r) => a + toCents(Number.isFinite(r.amount) ? r.amount : 0), 0);
  const valid = newTotalNum > 0 && remainingCents >= 0 && rowsCents === remainingCents && rows.every((r) => r.due_date);

  async function save() {
    if (!project) return;
    setError(null);
    if (!valid) return setError("A soma das parcelas pendentes deve fechar com o novo valor do projeto.");
    setBusy(true);
    try {
      await rpc("replace_pending_installments", {
        p_project_id: project.id,
        p_total_value: newTotalNum,
        p_installments: rows.map((r) => ({
          label: r.label.trim() || "Parcela",
          percent: newTotalNum ? round4((r.amount / newTotalNum) * 100) : 0,
          amount: r.amount,
          due_date: r.due_date,
        })),
      });
      toast.ok("Valor alterado e parcelas recalculadas.");
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
      size="xl"
      title="Alterar valor / recalcular parcelas"
      description={`${project.client_name} · ${project.project_type}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={!valid} onClick={save}>
            Confirmar recálculo
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Valor atual">
          <Input value={formatBRL(project.total_value)} disabled readOnly />
        </Field>
        <Field label="Novo valor total (R$)">
          <Input value={totalText} onChange={(e) => setTotalText(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label="Saldo a distribuir nas parcelas pendentes">
          <Input value={formatBRL(fromCents(Math.max(remainingCents, 0)))} disabled readOnly />
        </Field>
      </div>

      {remainingCents < 0 && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          O novo valor é menor que as parcelas já recebidas ou mantidas ({formatBRL(fromCents(keptSumCents))}).
        </p>
      )}

      {kept.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-bold">Parcelas preservadas (histórico)</h3>
          <ul className="divide-y divide-line rounded-2xl border border-line text-sm">
            {kept.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  {k.number}. {k.label} · {formatDate(k.due_date)}
                </span>
                <span className="font-semibold">
                  {formatBRL(k.amount)} {k.canceled_at ? <span className="text-xs font-normal text-muted">(cancelada)</span> : <span className="text-xs font-normal text-brand-600">(com pagamentos)</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="mb-2 mt-6 text-sm font-bold">Parcelas pendentes (serão substituídas)</h3>
      {remainingCents === 0 ? (
        <p className="text-sm text-muted">Nada a distribuir: as parcelas preservadas já cobrem o novo valor.</p>
      ) : (
        <ScheduleEditor total={newTotalNum} target={fromCents(Math.max(remainingCents, 0))} rows={rows} onChange={setRows} mode="amount" />
      )}
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}

