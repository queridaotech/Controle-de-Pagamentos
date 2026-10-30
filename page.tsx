"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { fetchAudit, fetchConditions, fetchProfiles, rpc } from "@/lib/data";
import { getSupabase } from "@/lib/supabase/client";
import { useQuery } from "@/lib/hooks";
import { describeAudit } from "@/lib/audit";
import { friendlyError, cn } from "@/lib/utils";
import type { PaymentCondition } from "@/lib/types";
import { useAuth } from "@/components/auth";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBox, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";

type Tab = "condicoes" | "usuarios" | "historico" | "demo";

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/* ------------------------------------------------------- Condições de pagamento */
function ConditionDialog({ open, condition, onClose, onSaved }: { open: boolean; condition: PaymentCondition | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<PaymentCondition["items"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(condition?.name ?? "");
    setDescription(condition?.description ?? "");
    setItems(condition?.items ?? [{ label: "Sinal", percent: 50, offset_days: 0 }, { label: "2ª parcela", percent: 50, offset_days: 30 }]);
    setError(null);
  }, [open, condition]);

  const sum = round4(items.reduce((a, i) => a + (Number.isFinite(i.percent) ? i.percent : 0), 0));
  const setItem = (idx: number, patch: Partial<PaymentCondition["items"][number]>) => setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const num = (v: string) => (v === "" ? NaN : parseFloat(v.replace(",", ".")));

  async function save() {
    if (!name.trim()) return setError("Informe o nome da condição.");
    if (sum !== 100) return setError(`A soma dos percentuais deve ser 100% (atual: ${sum.toLocaleString("pt-BR")}%).`);
    if (items.some((i) => !i.label.trim() || !Number.isFinite(i.offset_days) || i.offset_days < 0)) return setError("Revise a descrição e os dias de cada parcela.");
    setBusy(true);
    const payload = { name: name.trim(), description: description.trim() || null, items: items.map((i) => ({ label: i.label.trim(), percent: i.percent, offset_days: Math.round(i.offset_days) })) };
    const supabase = getSupabase();
    const { error } = condition ? await supabase.from("payment_conditions").update(payload).eq("id", condition.id) : await supabase.from("payment_conditions").insert(payload);
    setBusy(false);
    if (error) return setError(error.message.includes("payment_conditions_name_key") ? "Já existe uma condição com este nome." : friendlyError(error));
    toast.ok("Condição de pagamento salva.");
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={condition ? "Editar condição de pagamento" : "Nova condição de pagamento"}
      description="Os dias são contados a partir do vencimento do sinal (1ª parcela). Alterações valem para novos projetos."
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
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Sinal + 30 dias" />
        </Field>
        <Field label="Descrição">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-page">
            <tr>
              <th className="th">Parcela</th>
              <th className="th w-32">% do total</th>
              <th className="th w-40">Dias após o sinal</th>
              <th className="th w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((it, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2">
                  <Input className="h-10" value={it.label} onChange={(e) => setItem(idx, { label: e.target.value })} aria-label="Descrição" />
                </td>
                <td className="px-3 py-2">
                  <Input className="h-10" type="number" step="0.01" min="0" max="100" value={Number.isFinite(it.percent) ? it.percent : ""} onChange={(e) => setItem(idx, { percent: num(e.target.value) })} aria-label="Percentual" />
                </td>
                <td className="px-3 py-2">
                  <Input className="h-10" type="number" min="0" step="1" value={Number.isFinite(it.offset_days) ? it.offset_days : ""} onChange={(e) => setItem(idx, { offset_days: num(e.target.value) })} aria-label="Dias" />
                </td>
                <td className="px-1 py-2">
                  <IconButton disabled={items.length <= 1} onClick={() => setItems((cur) => cur.filter((_, i) => i !== idx))} aria-label="Remover parcela">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-page">
            <tr>
              <td className="px-4 py-3 text-xs font-semibold uppercase text-muted">Total</td>
              <td className={cn("px-4 py-3 font-bold", sum === 100 ? "text-brand-600" : "text-red-600")}>{sum.toLocaleString("pt-BR")}%</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button className="mt-3" variant="secondary" size="sm" onClick={() => setItems((cur) => [...cur, { label: `${cur.length + 1}ª parcela`, percent: 0, offset_days: (cur[cur.length - 1]?.offset_days ?? 0) + 30 }])}>
        <Plus className="h-4 w-4" /> Adicionar parcela
      </Button>
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}

function Conditions({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const { data, error, loading, reload } = useQuery(fetchConditions);
  const [dialog, setDialog] = useState<{ open: boolean; condition: PaymentCondition | null }>({ open: false, condition: null });
  const [toDelete, setToDelete] = useState<PaymentCondition | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    const { error } = await getSupabase().from("payment_conditions").delete().eq("id", toDelete.id);
    setBusy(false);
    setToDelete(null);
    if (error) return toast.error(friendlyError(error));
    toast.ok("Condição excluída. Projetos existentes mantêm suas parcelas.");
    void reload();
  }

  async function toggle(c: PaymentCondition) {
    const { error } = await getSupabase().from("payment_conditions").update({ active: !c.active }).eq("id", c.id);
    if (error) return toast.error(friendlyError(error));
    void reload();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-[15px] font-bold">Condições de pagamento</h2>
          <p className="text-sm text-muted">Modelos usados para gerar as parcelas dos projetos.{!isAdmin && " Somente administradores podem alterar."}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialog({ open: true, condition: null })}>
            <Plus className="h-4 w-4" /> Nova condição
          </Button>
        )}
      </div>
      {error && (
        <div className="px-5 pb-5">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      )}
      {loading && !data && <Spinner />}
      {data && data.length === 0 && <EmptyState title="Nenhuma condição cadastrada" />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  {c.name} {c.is_default && <Badge>padrão</Badge>} {!c.active && <Badge tone="amber">inativa</Badge>}
                </p>
                <p className="mt-0.5 text-sm text-muted">{c.items.map((i) => `${i.label} ${i.percent}%${i.offset_days ? ` (+${i.offset_days}d)` : ""}`).join(" · ")}</p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggle(c)}>
                    {c.active ? "Desativar" : "Ativar"}
                  </Button>
                  <IconButton aria-label="Editar condição" onClick={() => setDialog({ open: true, condition: c })}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  {!c.is_default && (
                    <IconButton aria-label="Excluir condição" onClick={() => setToDelete(c)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConditionDialog
        open={dialog.open}
        condition={dialog.condition}
        onClose={() => setDialog({ open: false, condition: null })}
        onSaved={() => {
          setDialog({ open: false, condition: null });
          void reload();
        }}
      />
      <ConfirmDialog open={!!toDelete} title="Excluir condição?" message={`“${toDelete?.name}” será removida da lista. Projetos já criados não são afetados.`} confirmLabel="Excluir" danger loading={busy} onClose={() => setToDelete(null)} onConfirm={remove} />
    </Card>
  );
}

/* --------------------------------------------------------------------- Usuários */
const ROLE_LABEL = { admin: "Administrador", user: "Colaborador" } as const;

function UserDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "user" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ full_name: "", email: "", password: "", role: "user" });
    setShow(false);
    setError(null);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim()) return setError("Informe o nome.");
    if (form.password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    setBusy(true);
    try {
      await rpc("admin_create_user", { p_email: form.email, p_password: form.password, p_full_name: form.full_name, p_role: form.role });
      toast.ok("Usuário criado. Ele já pode entrar com o e-mail e a senha informados.");
      onSaved();
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo usuário"
      description="Crie o acesso e escolha o perfil. O usuário entra já liberado."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" loading={busy}>
            Criar usuário
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="grid gap-4">
        <Field label="Nome">
          <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} autoComplete="off" required />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoComplete="off" required />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres. Repasse ao usuário com segurança; ele poderá trocá-la depois.">
          <div className="flex gap-2">
            <Input type={show ? "text" : "password"} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" required />
            <Button type="button" variant="outline" onClick={() => setShow((v) => !v)}>
              {show ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
        </Field>
        <Field label="Perfil" hint="Administrador: cria e exclui usuários e gerencia configurações. Colaborador: usa o sistema, sem acesso à gestão de usuários.">
          <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            <option value="user">Colaborador</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
        {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}

function Users({ isAdmin, selfId }: { isAdmin: boolean; selfId?: string }) {
  const toast = useToast();
  const { data, error, loading, reload } = useQuery(fetchProfiles);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(id: string, values: Record<string, unknown>) {
    const { error } = await getSupabase().from("profiles").update(values).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.ok("Usuário atualizado.");
    void reload();
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await rpc("admin_delete_user", { p_user_id: toDelete.id });
      toast.ok("Usuário excluído.");
      setToDelete(null);
      void reload();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <Card className="p-5">
        <h2 className="text-[15px] font-bold">Usuários</h2>
        <p className="mt-2 text-sm text-muted">Somente administradores podem gerenciar usuários.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-[15px] font-bold">Usuários</h2>
          <p className="text-sm text-muted">Crie acessos, defina o perfil (Administrador ou Colaborador) e exclua quem não deve mais usar o sistema.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo usuário
        </Button>
      </div>
      {error && (
        <div className="px-5 pb-5">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      )}
      {loading && !data && <Spinner />}
      {data && (
        <ul className="divide-y divide-line border-t border-line">
          {data.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  {u.full_name || u.email} {u.id === selfId && <Badge tone="green">você</Badge>}
                </p>
                <p className="text-sm text-muted">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select className="h-10 w-40" value={u.role} disabled={u.id === selfId} onChange={(e) => patch(u.id, { role: e.target.value })} aria-label="Perfil">
                  <option value="user">{ROLE_LABEL.user}</option>
                  <option value="admin">{ROLE_LABEL.admin}</option>
                </Select>
                <Button variant={u.active ? "secondary" : "primary"} size="sm" disabled={u.id === selfId} onClick={() => patch(u.id, { active: !u.active })}>
                  {u.active ? "Desativar" : "Liberar acesso"}
                </Button>
                <IconButton disabled={u.id === selfId} onClick={() => setToDelete({ id: u.id, name: u.full_name || u.email || "usuário" })} aria-label={`Excluir ${u.full_name || u.email}`}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <UserDialog open={creating} onClose={() => setCreating(false)} onSaved={reload} />
      <ConfirmDialog open={!!toDelete} title="Excluir usuário?" message={`${toDelete?.name ?? ""} perderá o acesso ao sistema. Os registros que essa pessoa criou continuam preservados. Esta ação não pode ser desfeita.`} confirmLabel="Excluir" danger loading={busy} onClose={() => setToDelete(null)} onConfirm={remove} />
    </Card>
  );
}

/* -------------------------------------------------------------------- Histórico */
function History() {
  const { data, error, loading, reload } = useQuery(() => fetchAudit(undefined, 150));
  const names: Record<string, string> = { clients: "Cliente", projects: "Projeto", installments: "Parcela", payments: "Pagamento" };
  return (
    <Card>
      <div className="p-5">
        <h2 className="text-[15px] font-bold">Histórico de alterações</h2>
        <p className="text-sm text-muted">Registro automático das últimas 150 alterações em clientes, projetos, parcelas e pagamentos.</p>
      </div>
      {error && (
        <div className="px-5 pb-5">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      )}
      {loading && !data && <Spinner />}
      {data && data.length === 0 && <EmptyState title="Nenhuma alteração registrada" />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line border-t border-line text-sm">
          {data.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3">
              <span className="w-36 shrink-0 text-xs tabular-nums text-muted">{new Date(h.changed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              <Badge>{names[h.table_name] ?? h.table_name}</Badge>
              <span className="min-w-0 flex-1 break-words text-muted">{describeAudit(h)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- Demonstração */
function Demo({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"load" | "remove" | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function run(fn: "load_demo_data" | "remove_demo_data") {
    setBusy(fn === "load_demo_data" ? "load" : "remove");
    try {
      await rpc(fn);
      toast.ok(fn === "load_demo_data" ? "Dados de demonstração carregados." : "Dados de demonstração removidos.");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-bold">Dados de demonstração</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Carrega 3 clientes e 3 projetos fictícios (identificados com “[DEMO]”) para você conhecer o sistema. Eles podem ser removidos a qualquer momento sem afetar seus dados reais.
      </p>
      {!isAdmin ? (
        <p className="mt-4 text-sm text-muted">Somente administradores podem carregar ou remover dados de demonstração.</p>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy === "load"} onClick={() => run("load_demo_data")}>
            Carregar dados de demonstração
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Remover dados de demonstração
          </Button>
        </div>
      )}
      <ConfirmDialog open={confirm} title="Remover dados de demonstração?" message="Clientes, projetos, parcelas e pagamentos marcados como [DEMO] serão excluídos. Seus dados reais não são afetados." confirmLabel="Remover" danger loading={busy === "remove"} onClose={() => setConfirm(false)} onConfirm={() => run("remove_demo_data")} />
    </Card>
  );
}

/* ------------------------------------------------------------------------ Página */
export default function ConfiguracoesPage() {
  const { profile, isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("condicoes");
  const tabs: { key: Tab; label: string }[] = [
    { key: "condicoes", label: "Condições de pagamento" },
    ...(isAdmin ? [{ key: "usuarios" as Tab, label: "Usuários" }] : []),
    { key: "historico", label: "Histórico" },
    { key: "demo", label: "Dados de demonstração" },
  ];
  return (
    <>
      <PageHeader title="Configurações" subtitle={`Conectado como ${profile?.email ?? ""} (${isAdmin ? "administrador" : "colaborador"}).`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} aria-pressed={tab === t.key} className={cn("h-10 rounded-full px-4 text-sm font-semibold transition", tab === t.key ? "bg-brand-600 text-white" : "bg-white text-muted shadow-card hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "condicoes" && <Conditions isAdmin={isAdmin} />}
      {tab === "usuarios" && <Users isAdmin={isAdmin} selfId={profile?.id} />}
      {tab === "historico" && <History />}
      {tab === "demo" && <Demo isAdmin={isAdmin} />}
    </>
  );
}
