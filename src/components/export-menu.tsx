"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { exportCSV, exportExcel, type Cell } from "@/lib/export";
import { Button } from "./ui";

/** Botão "Exportar" com opções Excel (.xls) e CSV. */
export function ExportMenu({
  filename,
  headers,
  getRows,
  disabled,
}: {
  filename: string;
  headers: string[];
  getRows: () => Cell[][];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Download className="h-4 w-4" /> Exportar
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          <button
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-page"
            onClick={() => {
              exportExcel(filename, headers, getRows());
              setOpen(false);
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-brand-500" /> Excel (.xls)
          </button>
          <button
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-page"
            onClick={() => {
              exportCSV(filename, headers, getRows());
              setOpen(false);
            }}
          >
            <FileText className="h-4 w-4 text-brand-500" /> CSV (separado por “;”)
          </button>
        </div>
      )}
    </div>
  );
}
