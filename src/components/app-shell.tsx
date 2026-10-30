"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, FileBarChart, FolderKanban, LayoutDashboard, LogOut, Menu, Settings, Users, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth";
import { Logo } from "./logo";
import { IconButton } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/pagamentos", label: "Controle de Pagamentos", icon: Wallet },
  { href: "/agenda", label: "Agenda Financeira", icon: CalendarDays },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const item = (href: string, label: string, Icon: typeof Users) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
          active ? "bg-brand-50 font-semibold text-brand-600" : "text-muted hover:bg-page hover:text-ink",
        )}
      >
        {active && <span className="absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />}
        <Icon className="h-[18px] w-[18px]" />
        {label}
      </Link>
    );
  };
  return (
    <nav className="flex flex-col gap-1">
      <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/70">Menu</p>
      {NAV.map((n) => item(n.href, n.label, n.icon))}
      <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/70">Geral</p>
      {item("/configuracoes", "Configurações", Settings)}
    </nav>
  );
}

function UserCard() {
  const { profile, signOut } = useAuth();
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-600 p-4 text-white">
      <p className="truncate text-sm font-semibold">{profile?.full_name ?? "Usuário"}</p>
      <p className="truncate text-xs text-brand-100/80">{profile?.email}</p>
      <button
        onClick={() => void signOut()}
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-brand-300 text-[13px] font-semibold text-brand-800 transition hover:bg-brand-200"
      >
        <LogOut className="h-4 w-4" /> Sair
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen p-3 sm:p-4 lg:p-5">
      {/* Mobile top bar */}
      <header className="no-print card sticky top-3 z-30 mb-3 flex items-center justify-between px-4 py-3 lg:hidden">
        <Logo />
        <IconButton onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </IconButton>
      </header>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-brand-900/45" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-3 left-3 flex w-72 flex-col gap-6 rounded-card bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Logo />
              <IconButton onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto pl-4">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <UserCard />
          </aside>
        </div>
      )}

      <div className="mx-auto flex max-w-[1560px] gap-5">
        <aside className="no-print card sticky top-5 hidden h-[calc(100vh-2.5rem)] w-[260px] shrink-0 flex-col gap-6 p-5 lg:flex">
          <Logo />
          <div className="flex-1 overflow-y-auto pl-4">
            <NavLinks />
          </div>
          <UserCard />
        </aside>
        <main className="min-w-0 flex-1 py-1 lg:py-3 lg:pr-2">{children}</main>
      </div>
    </div>
  );
}
