import { getSupabase } from "./supabase/client";
import type {
  AuditEntry,
  ClientRow,
  InstallmentRow,
  PaymentCondition,
  PaymentRow,
  ProjectRow,
  Profile,
} from "./types";

/**
 * Camada de acesso a dados. Tudo vai direto ao Supabase (RLS protege no banco).
 * As consultas paginam em blocos de 1000 linhas para não esbarrar no limite da API.
 */

const PAGE = 1000;

type Builder = (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

async function fetchAll<T>(build: Builder): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export const fetchClients = () =>
  fetchAll<ClientRow>((f, t) => getSupabase().from("clients_view").select("*").order("name").range(f, t));

export const fetchProjects = () =>
  fetchAll<ProjectRow>((f, t) =>
    getSupabase().from("projects_view").select("*").order("start_date", { ascending: false }).order("id").range(f, t),
  );

export const fetchInstallments = () =>
  fetchAll<InstallmentRow>((f, t) =>
    getSupabase().from("installments_view").select("*").order("due_date").order("number").order("id").range(f, t),
  );

export const fetchPayments = () =>
  fetchAll<PaymentRow>((f, t) =>
    getSupabase().from("payments").select("*").order("paid_at", { ascending: false }).order("id").range(f, t),
  );

export async function fetchConditions(): Promise<PaymentCondition[]> {
  const { data, error } = await getSupabase().from("payment_conditions").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentCondition[];
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await getSupabase().from("profiles").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function fetchAudit(filter?: { table: string; ids: string[] }, limit = 100): Promise<AuditEntry[]> {
  let q = getSupabase().from("audit_log").select("*").order("changed_at", { ascending: false }).limit(limit);
  if (filter) q = q.eq("table_name", filter.table).in("record_id", filter.ids);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditEntry[];
}

/** Executa uma função RPC e lança erro com a mensagem do banco. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
