import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Petrosupply Financeiro", template: "%s · Petrosupply Financeiro" },
  description: "Gestão de clientes, projetos e controle de recebíveis da Petrosupply.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#005A32",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
