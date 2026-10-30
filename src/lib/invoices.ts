import { getSupabase } from "./supabase/client";

const BUCKET = "invoices";
export const INVOICE_MAX_BYTES = 10 * 1024 * 1024;

/** Valida o arquivo escolhido: somente PDF, até 10 MB. Retorna a mensagem de erro ou null. */
export function validateInvoiceFile(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Envie a nota fiscal em formato PDF.";
  if (file.size > INVOICE_MAX_BYTES) return "O PDF deve ter no máximo 10 MB.";
  if (file.size === 0) return "O arquivo está vazio.";
  return null;
}

/** Envia o PDF para o Storage em <projeto>/<uuid>.pdf e devolve o caminho e o nome original. */
export async function uploadInvoice(projectId: string, file: File): Promise<{ path: string; name: string }> {
  const path = `${projectId}/${crypto.randomUUID()}.pdf`;
  const { error } = await getSupabase().storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(error.message);
  return { path, name: file.name };
}

/** Remove o arquivo do Storage (melhor esforço: falhas não interrompem o fluxo). */
export async function removeInvoiceFile(path: string | null | undefined) {
  if (!path) return;
  await getSupabase().storage.from(BUCKET).remove([path]);
}

/** Link temporário (60 s) para visualizar (download=false) ou baixar (download=true) o PDF. */
export async function invoiceUrl(path: string, opts: { download: boolean; fileName?: string | null }): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60, opts.download ? { download: opts.fileName || true } : undefined);
  if (error || !data) throw new Error(error?.message ?? "Não foi possível abrir o arquivo.");
  return data.signedUrl;
}
