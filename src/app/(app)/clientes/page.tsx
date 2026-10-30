"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { fetchClients } from "@/lib/data";
import { useQuery, usePagination } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { formatBRL, formatCNPJ, onlyDigits } from "@/lib/format";
import { friendlyError, normalize } from "@/lib/utils";
import type { ClientRow } from "@/lib/types";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBox, IconButton, Input, PageHeader, Pagination, Spinner } from "@/components/ui";
import { ClientDialog } from "@/components/forms/client-dialog";
import { ExportMenu } from "@/components/export-menu";
import { useToast } from "@/components/toast";

export default function ClientesPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useQuery(fetchClients);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; client: ClientRow | null }>({ open: false, client: null });
  const [toDelete, setToDelete] = useState<ClientRow | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const digits = onlyDigits(search);
    return (data ?? []).filter((c) => !q || normalize(c.name).includes(q) || (digits.length > 0 && c.cnpj.includes(digits)));
  }, [data, search]);
  const pg = usePagination(filtered, 15);

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    const { error } = await getSupabase().from("clients").delete().eq("id", toDelete.id);
    setBusy(false);
    setToDelete(null);
    if (error) return toast.error(friendlyError(error));
    toast.ok("Cliente excluído.");
    void reload();
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro de clientes e visão consolidada de contratos e recebimentos."
        actions={
          <>
            <ExportMenu
              filename="clientes"
              headers={["Cliente", "CNPJ", "Projetos", "Contratado", "Recebido", "Saldo pendente", "Em atraso"]}
              getRows={() => filtered.map((c) => [c.name, formatCNPJ(c.cnpj), c.projects_count, formatBRL(c.total_contracted), formatBRL(c.total_received), formatBRL(c.total_pending), formatBRL(c.total_overdue)])}
              disabled={filtered.length === 0}
            />
            <Button onClick={() => setDialog({ open: true, client: null })}>
              <Plus className="h-4 w-4" /> Novo cliente
            </Button>
          </>
        }
      />

      <Card>
        <div className="border-b border-line p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou CNPJ" className="pl-10" aria-label="Buscar clientes" />
          </div>
        </div>

        {error && (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        )}
        {loading && !data && <Spinner />}

        {data && filtered.length === 0 && (
          <EmptyState
            title={data.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado"}
            text={data.length === 0 ? "Cadastre o primeiro cliente para começar a criar projetos e cronogramas de pagamento." : "Revise a busca."}
            action={data.length === 0 ? <Button onClick={() => setDialog({ open: true, client: null })}>Novo cliente</Button> : undefined}
          />
        )}

        {filtered.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className="th">Cliente</th>
                    <th className="th">CNPJ</th>
                    <th className="th text-center">Projetos</th>
                    <th className="th text-right">Contratado</th>
                    <th className="th text-right">Recebido</th>
                    <th className="th text-right">Saldo pendente</th>
                    <th className="th text-right">Em atraso</th>
                    <th className="th text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pg.slice.map((c) => (
                    <tr key={c.id} className="cursor-pointer transition hover:bg-brand-50/40" onClick={() => router.push(`/clientes/${c.id}`)}>
                      <td className="td">
                        <Link href={`/clientes/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:text-brand-600">
                          {c.name}
                        </Link>
                        {c.is_demo && (
                          <span className="ml-2">
                            <Badge tone="amber">demo</Badge>
                          </span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap tabular-nums text-muted">{formatCNPJ(c.cnpj)}</td>
                      <td className="td text-center">{c.projects_count}</td>
                      <td className="td text-right font-semibold tabular-nums">{formatBRL(c.total_contracted)}</td>
                      <td className="td text-right tabular-nums text-brand-600">{formatBRL(c.total_received)}</td>
                      <td className="td text-right tabular-nums">{formatBRL(c.total_pending)}</td>
                      <td className={`td text-right tabular-nums ${c.total_overdue > 0 ? "font-semibold text-red-600" : "text-muted"}`}>{formatBRL(c.total_overdue)}</td>
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-0.5">
                          <IconButton aria-label="Editar cliente" title="Editar" onClick={() => setDialog({ open: true, client: c })}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton aria-label="Excluir cliente" title="Excluir" onClick={() => setToDelete(c)}>
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pg} onPage={pg.setPage} />
          </>
        )}
      </Card>

      <ClientDialog
        open={dialog.open}
        client={dialog.client}
        onClose={() => setDialog({ open: false, client: null })}
        onSaved={() => {
          setDialog({ open: false, client: null });
          void reload();
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Excluir cliente?"
        message={
          <>
            <strong className="text-ink">{toDelete?.name}</strong> será removido. Clientes com projetos vinculados não podem ser excluídos (o histórico financeiro é preservado).
          </>
        }
        confirmLabel="Excluir"
        danger
        loading={busy}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
      />
    </>
  );
}
