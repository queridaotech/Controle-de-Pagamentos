"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, HandCoins, Pencil } from "lucide-react";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import type { InstallmentRow } from "@/lib/types";
import { IconButton, StatusBadge } from "./ui";

/** Tabela reutilizável de parcelas (controle geral, projeto e cliente). */
export function InstallmentsTable({
  rows,
  showClient = true,
  showProject = true,
  sort,
  onSort,
  onPay,
  onEdit,
}: {
  rows: InstallmentRow[];
  showClient?: boolean;
  showProject?: boolean;
  sort?: "asc" | "desc";
  onSort?: () => void;
  onPay?: (i: InstallmentRow) => void;
  onEdit?: (i: InstallmentRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b border-line">
          <tr>
            {showClient && <th className="th">Cliente</th>}
            {showClient && <th className="th">CNPJ</th>}
            {showProject && <th className="th">Projeto</th>}
            <th className="th">Parcela</th>
            <th className="th text-right">Valor</th>
            <th className="th">
              {onSort ? (
                <button onClick={onSort} className="inline-flex items-center gap-1 uppercase hover:text-ink" aria-label="Ordenar por vencimento">
                  Vencimento {sort === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                </button>
              ) : (
                "Vencimento"
              )}
            </th>
            <th className="th">Pagamento</th>
            <th className="th">Status</th>
            <th className="th">Forma de pagamento</th>
            <th className="th text-right no-print">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const open = r.status !== "pago" && r.status !== "cancelado";
            return (
              <tr key={r.id} className="transition hover:bg-brand-50/40">
                {showClient && (
                  <td className="td max-w-[220px]">
                    <Link href={`/clientes/${r.client_id}`} className="block truncate font-semibold hover:text-brand-600">
                      {r.client_name}
                    </Link>
                  </td>
                )}
                {showClient && <td className="td whitespace-nowrap text-muted tabular-nums">{formatCNPJ(r.cnpj)}</td>}
                {showProject && (
                  <td className="td whitespace-nowrap">
                    <Link href={`/projetos/${r.project_id}`} className="hover:text-brand-600">
                      {r.project_type}
                    </Link>
                  </td>
                )}
                <td className="td whitespace-nowrap">
                  <span className="font-semibold">{r.number}</span> <span className="text-muted">· {r.label}</span>
                </td>
                <td className="td whitespace-nowrap text-right">
                  <p className="font-semibold tabular-nums">{formatBRL(r.amount)}</p>
                  {r.paid_amount > 0 && r.status !== "pago" && <p className="text-xs text-muted">recebido {formatBRL(r.paid_amount)}</p>}
                </td>
                <td className="td whitespace-nowrap tabular-nums">{formatDate(r.due_date)}</td>
                <td className="td whitespace-nowrap tabular-nums text-muted">{formatDate(r.paid_at)}</td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td whitespace-nowrap text-muted">{r.payment_condition_name ?? "Personalizada"}</td>
                <td className="td no-print">
                  <div className="flex items-center justify-end gap-0.5">
                    {onPay && open && (
                      <IconButton onClick={() => onPay(r)} aria-label="Registrar pagamento" title="Registrar pagamento" className="text-brand-500 hover:bg-brand-50 hover:text-brand-600">
                        <HandCoins className="h-[18px] w-[18px]" />
                      </IconButton>
                    )}
                    {onEdit && (
                      <IconButton onClick={() => onEdit(r)} aria-label="Editar parcela" title="Editar parcela">
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    )}
                    {showProject && (
                      <Link href={`/projetos/${r.project_id}`} aria-label="Abrir projeto" title="Abrir projeto" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-page hover:text-ink">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
