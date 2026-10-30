import type { InstallmentStatus } from "./types";

export const STATUS_LABEL: Record<InstallmentStatus, string> = {
  a_vencer: "A vencer",
  vence_hoje: "Vence hoje",
  atrasado: "Atrasado",
  parcial: "Pago parcialmente",
  pago: "Pago",
  cancelado: "Cancelado",
};

/** Cores por status: tom de fundo, texto e ponto indicador. */
export const STATUS_STYLE: Record<InstallmentStatus, { badge: string; dot: string; chart: string }> = {
  a_vencer: { badge: "bg-sky-50 text-sky-800", dot: "bg-sky-500", chart: "#0EA5E9" },
  vence_hoje: { badge: "bg-amber-50 text-amber-800", dot: "bg-amber-500", chart: "#F59E0B" },
  atrasado: { badge: "bg-red-50 text-red-700", dot: "bg-red-500", chart: "#DC2626" },
  parcial: { badge: "bg-violet-50 text-violet-800", dot: "bg-violet-500", chart: "#8B5CF6" },
  pago: { badge: "bg-brand-100 text-brand-600", dot: "bg-brand-500", chart: "#238B45" },
  cancelado: { badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400", chart: "#9CA3AF" },
};

export const ALL_STATUSES: InstallmentStatus[] = ["a_vencer", "vence_hoje", "atrasado", "parcial", "pago", "cancelado"];
