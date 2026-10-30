import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normaliza texto para busca (sem acentos, minúsculo). */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Traduz erros do Postgres/Supabase para mensagens amigáveis. */
export function friendlyError(error: unknown): string {
  const msg =
    typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
  if (msg.includes("clients_cnpj_unique")) return "Já existe um cliente cadastrado com este CNPJ.";
  if (msg.includes("installments_unique_number")) return "Parcela duplicada para este projeto.";
  if (msg.includes("violates foreign key constraint") && msg.includes("payments"))
    return "Não é possível excluir: existem pagamentos registrados (o histórico financeiro é preservado). Use cancelar.";
  if (msg.includes("violates foreign key constraint") && msg.includes("projects"))
    return "Não é possível excluir: o cliente possui projetos vinculados.";
  if (msg.includes("row-level security")) return "Sem permissão para esta ação.";
  return msg;
}
