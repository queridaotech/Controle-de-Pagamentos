"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { formatCNPJ, isValidCNPJ, onlyDigits } from "@/lib/format";
import { friendlyError } from "@/lib/utils";
import { Button, Field, Input, Modal, Textarea } from "../ui";
import { useToast } from "../toast";

export interface ClientFormValue {
  id?: string;
  name: string;
  cnpj: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

/** Cadastro e edição de cliente (razão social + CNPJ validado). */
export function ClientDialog({
  open,
  client,
  onClose,
  onSaved,
}: {
  open: boolean;
  client?: ClientFormValue | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(client?.name ?? "");
    setCnpj(formatCNPJ(client?.cnpj ?? ""));
    setEmail(client?.email ?? "");
    setPhone(client?.phone ?? "");
    setNotes(client?.notes ?? "");
    setError(null);
    setTouched(false);
  }, [open, client]);

  const cnpjInvalid = touched && !isValidCNPJ(cnpj);
  const nameInvalid = touched && name.trim().length === 0;

  async function save() {
    setTouched(true);
    if (!name.trim() || !isValidCNPJ(cnpj)) return;
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      cnpj: onlyDigits(cnpj),
      email: email.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    };
    const supabase = getSupabase();
    const res = client?.id
      ? await supabase.from("clients").update(payload).eq("id", client.id).select("id").single()
      : await supabase.from("clients").insert(payload).select("id").single();
    setBusy(false);
    if (res.error) {
      setError(friendlyError(res.error));
      return;
    }
    toast.ok(client?.id ? "Cliente atualizado." : "Cliente cadastrado.");
    onSaved((res.data as { id: string }).id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client?.id ? "Editar cliente" : "Novo cliente"}
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
        <Field label="Nome do cliente / Razão Social" error={nameInvalid ? "Informe o nome." : null} className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="CNPJ" error={cnpjInvalid ? "CNPJ inválido." : null}>
          <Input value={cnpj} onChange={(e) => setCnpj(formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" inputMode="numeric" />
        </Field>
        <Field label="Telefone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="E-mail financeiro" className="sm:col-span-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}
