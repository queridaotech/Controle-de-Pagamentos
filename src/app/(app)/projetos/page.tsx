"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { fetchClients, fetchConditions, fetchProjects } from "@/lib/data";
import { useQuery, usePagination } from "@/lib/hooks";
import { formatBRL, formatCNPJ, formatDate, onlyDigits } from "@/lib/format";
import { normalize } from "@/lib/utils";
import { PROJECT_TYPES } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Pagination, ProgressBar, Select, Spinner } from "@/components/ui";
import { ProjectDialog } from "@/components/forms/project-dialogs";
import { ExportMenu } from "@/components/export-menu";

const STATUS_TEXT = { ativo: "Ativo", concluido: "Concluído", cancelado: "Cancelado" } as const;

export default function ProjetosPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useQuery(async () => {
    const [projects, clients, conditions] = await Promise.all([fetchProjects(), fetchClients(), fetchConditions()]);
    return { projects, clients, conditions };
  });
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const digits = onlyDigits(search);
    return (data?.projects ?? []).filter(
      (p) =>
        (!q || normalize(p.client_name).includes(q) || (digits.length > 0 && p.cnpj.includes(digits))) &&
        (!type || p.project_type === type) &&
        (!status || p.status === status),
    );
  }, [data, search, type, status]);
  const pg = usePagination(filtered, 15);

  return (
    <>
      <PageHeader
        title="Projetos"
        subtitle="Contratos comerciais, cronogramas e situação financeira de cada projeto."
        actions={
          <>
            <ExportMenu
              filename="projetos"
              headers={["Cliente", "CNPJ", "Projeto", "Início", "Valor total", "Recebido", "Saldo pendente", "Situação"]}
              getRows={() => filtered.map((p) => [p.client_name, formatCNPJ(p.cnpj), p.project_type, formatDate(p.start_date), formatBRL(p.total_value), formatBRL(p.total_received), formatBRL(p.total_pending), STATUS_TEXT[p.status]])}
              disabled={filtered.length === 0}
            />
            <Button onClick={() => setCreating(true)} disabled={!data || data.clients.length === 0} title={data && data.clients.length === 0 ? "Cadastre um cliente primeiro" : undefined}>
              <Plus className="h-4 w-4" /> Novo projeto
            </Button>
          </>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_200px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente ou CNPJ" className="pl-10" aria-label="Buscar projetos" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filtrar por projeto">
            <option value="">Todos os projetos</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            <option value="ativo">Ativo</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </Select>
        </div>

        {error && (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        )}
        {loading && !data && <Spinner />}
        {data && filtered.length === 0 && (
          <EmptyState
            title={data.projects.length === 0 ? "Nenhum projeto cadastrado" : "Nenhum projeto encontrado"}
            text={data.projects.length === 0 ? (data.clients.length === 0 ? "Cadastre um cliente e depois crie o primeiro projeto." : "Crie o primeiro projeto para gerar o cronograma de pagamentos.") : "Revise os filtros."}
            action={
              data.projects.length === 0 ? (
                data.clients.length === 0 ? (
                  <Link href="/clientes">
                    <Button>Cadastrar cliente</Button>
                  </Link>
                ) : (
                  <Button onClick={() => setCreating(true)}>Novo projeto</Button>
                )
              ) : undefined
            }
          />
        )}

        {filtered.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className="th">Cliente</th>
                    <th className="th">Projeto</th>
                    <th className="th">Início</th>
                    <th className="th text-right">Valor total</th>
                    <th className="th w-48">Recebimento</th>
                    <th className="th text-right">Saldo</th>
                    <th className="th">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pg.slice.map((p) => (
                    <tr key={p.id} className="cursor-pointer transition hover:bg-brand-50/40" onClick={() => router.push(`/projetos/${p.id}`)}>
                      <td className="td max-w-[240px]">
                        <p className="truncate font-semibold">{p.client_name}</p>
                        <p className="text-xs tabular-nums text-muted">{formatCNPJ(p.cnpj)}</p>
                      </td>
                      <td className="td whitespace-nowrap">{p.project_type}</td>
                      <td className="td whitespace-nowrap tabular-nums text-muted">{formatDate(p.start_date)}</td>
                      <td className="td text-right font-semibold tabular-nums">{formatBRL(p.total_value)}</td>
                      <td className="td">
                        <ProgressBar value={p.total_value > 0 ? (p.total_received / p.total_value) * 100 : 0} />
                        <p className="mt-1 text-xs text-muted">
                          {formatBRL(p.total_received)} · {p.installments_paid}/{p.installments_count} parcelas
                        </p>
                      </td>
                      <td className={`td text-right tabular-nums ${p.total_overdue > 0 ? "font-semibold text-red-600" : ""}`}>{formatBRL(p.total_pending)}</td>
                      <td className="td">
                        <Badge tone={p.status === "ativo" ? "green" : p.status === "cancelado" ? "red" : "neutral"}>{STATUS_TEXT[p.status]}</Badge>
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

      {data && (
        <ProjectDialog
          open={creating}
          clients={data.clients}
          conditions={data.conditions}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            router.push(`/projetos/${id}`);
          }}
        />
      )}
    </>
  );
}
