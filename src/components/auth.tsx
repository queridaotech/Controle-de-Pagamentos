"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { Button, Spinner } from "./ui";
import { Logo } from "./logo";

interface AuthState {
  profile: Profile | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}
const AuthCtx = createContext<AuthState>({ profile: null, isAdmin: false, signOut: async () => {} });
export const useAuth = () => useContext(AuthCtx);

/** Tela exibida enquanto as variáveis de ambiente do Supabase não existem. */
export function MissingConfig() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-lg p-8">
        <Logo />
        <h1 className="mt-6 text-xl font-bold">Configuração pendente</h1>
        <p className="mt-2 text-sm text-muted">
          Defina <code className="rounded bg-page px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="rounded bg-page px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> nas variáveis de ambiente (arquivo{" "}
          <code className="rounded bg-page px-1.5 py-0.5">.env.local</code> ou painel da Vercel) e reinicie a aplicação. Veja o README.
        </p>
      </div>
    </div>
  );
}

/** Garante sessão ativa e perfil liberado; fornece o perfil ao restante do app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "pending">("loading");
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.replace("/login");
      return;
    }
    const { data: p } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    setProfile((p as Profile) ?? null);
    setState(p && (p as Profile).active ? "ready" : "pending");
  }, [router]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void load();
    const { data: sub } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [load, router]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    router.replace("/login");
  }, [router]);

  if (!isSupabaseConfigured) return <MissingConfig />;
  if (state === "loading") return <Spinner label="Verificando acesso…" />;

  if (state === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Acesso aguardando liberação</h1>
          <p className="mt-2 text-sm text-muted">
            Sua conta ({profile?.email}) foi criada, mas ainda não foi liberada. Peça a um administrador para ativá-la em Configurações &gt; Usuários.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => void load()}>
              Verificar novamente
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <AuthCtx.Provider value={{ profile, isAdmin: profile?.role === "admin", signOut }}>{children}</AuthCtx.Provider>;
}
