/**
 * Exportação para CSV e Excel.
 * - CSV: separador ";" + BOM UTF-8, abre direto no Excel em português.
 * - Excel (.xls): tabela HTML que o Excel abre nativamente.
 */

export type Cell = string | number | null | undefined;

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const csvCell = (v: Cell) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCSV(filename: string, headers: string[], rows: Cell[][]) {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(";"));
  download(`${filename}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
}

const esc = (v: Cell) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function exportExcel(filename: string, headers: string[], rows: Cell[][]) {
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">
<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  download(`${filename}.xls`, html, "application/vnd.ms-excel");
}
