"use client";

import { useRef } from "react";
import { Download, Eye, FileText, Paperclip, Trash2 } from "lucide-react";
import { INVOICE_MAX_BYTES, invoiceUrl, validateInvoiceFile } from "@/lib/invoices";
import { friendlyError } from "@/lib/utils";
import { Button, Field, IconButton, Input } from "../ui";
import { useToast } from "../toast";

export interface InvoiceValue {
  number: string;
  /** novo arquivo escolhido (ainda não enviado) */
  file: File | null;
  /** arquivo já salvo no projeto */
  existing: { path: string; name: string | null } | null;
  /** usuário pediu para remover o arquivo já salvo */
  removeExisting: boolean;
}

export const EMPTY_INVOICE: InvoiceValue = { number: "", file: null, existing: null, removeExisting: false };

/** Abre (ver) ou baixa o PDF salvo, usando um link temporário. */
export function useInvoiceActions() {
  const toast = useToast();
  return async function open(path: string, name: string | null, download: boolean) {
    try {
      const url = await invoiceUrl(path, { download, fileName: name });
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = name || "nota-fiscal.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
}

/**
 * Campos opcionais da Nota Fiscal: número + anexo em PDF.
 * Usado no cadastro e na edição do projeto.
 */
export function InvoiceFields({ value, onChange, onError }: { value: InvoiceValue; onChange: (v: InvoiceValue) => void; onError: (msg: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const act = useInvoiceActions();
  const saved = value.existing && !value.removeExisting ? value.existing : null;

  function pick(file: File | undefined) {
    if (!file) return;
    const err = validateInvoiceFile(file);
    if (err) {
      onError(err);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onError(null);
    onChange({ ...value, file });
  }

  return (
    <div className="mt-5 rounded-2xl border border-line p-4">
      <h3 className="text-sm font-bold">Nota Fiscal (opcional)</h3>
      <p className="mt-0.5 text-xs text-muted">Você pode informar o número e anexar o PDF agora ou depois, quando a nota for emitida.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <Field label="Número da NF">
          <Input value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} placeholder="Ex.: 12345" inputMode="numeric" maxLength={30} />
        </Field>
        <Field label="Arquivo PDF" hint={`Somente PDF, até ${INVOICE_MAX_BYTES / 1024 / 1024} MB.`}>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Selecionar PDF da nota fiscal" />
          {value.file ? (
            <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1 truncate font-medium">{value.file.name}</span>
              <IconButton
                type="button"
                aria-label="Remover arquivo escolhido"
                onClick={() => {
                  onChange({ ...value, file: null });
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ) : saved ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1 truncate font-medium">{saved.name || "nota-fiscal.pdf"}</span>
              <IconButton type="button" aria-label="Visualizar PDF" onClick={() => act(saved.path, saved.name, false)}>
                <Eye className="h-4 w-4" />
              </IconButton>
              <IconButton type="button" aria-label="Baixar PDF" onClick={() => act(saved.path, saved.name, true)}>
                <Download className="h-4 w-4" />
              </IconButton>
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                Substituir
              </Button>
              <IconButton type="button" aria-label="Remover PDF" onClick={() => onChange({ ...value, removeExisting: true })}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <Paperclip className="h-4 w-4" /> Anexar PDF
            </Button>
          )}
          {value.removeExisting && !value.file && <p className="mt-1 text-xs text-amber-700">O arquivo atual será removido ao salvar.</p>}
        </Field>
      </div>
    </div>
  );
}
