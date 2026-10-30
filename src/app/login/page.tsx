"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { Logo, LogoMark } from "@/components/logo";
import { MissingConfig } from "@/components/auth";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <MissingConfig />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = getSupabase();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setInfo("Conta criada! Confirme o e-mail enviado para liberar o primeiro acesso.");
          setMode("signin");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.includes("Invalid login credentials")
          ? "E-mail ou senha incorretos."
          : msg.includes("already registered")
            ? "Este e-mail já possui cadastro."
            : msg.includes("Password should be")
              ? "A senha deve ter pelo menos 6 caracteres."
              : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-brand-800 text-white">
      <header className="mx-auto flex w-full max-w-6xl items-center px-6 py-6">
        <Logo light />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col items-center px-6 pb-40 pt-8 text-center">
        <LogoMark className="h-14 w-14" />
        <h1 className="mt-6 text-4xl font-light tracking-tight">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
        <p className="mt-3 text-sm text-brand-100/85">
          {mode === "signin" ? "Acesse o controle financeiro de projetos e recebíveis." : "O primeiro cadastro vira administrador do sistema."}
        </p>

        <form onSubmit={submit} className="mt-9 w-full space-y-3 text-left">
          {mode === "signup" && (
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              autoComplete="name"
              className="h-12 w-full rounded-xl bg-white/10 px-4 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-brand-100/60 focus:ring-2 focus:ring-brand-300"
            />
          )}
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            autoComplete="email"
            className="h-12 w-full rounded-xl bg-white/10 px-4 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-brand-100/60 focus:ring-2 focus:ring-brand-300"
          />
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="h-12 w-full rounded-xl bg-white/10 px-4 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-brand-100/60 focus:ring-2 focus:ring-brand-300"
          />

          {error && <p className="rounded-xl bg-red-500/15 px-4 py-2.5 text-sm text-red-100">{error}</p>}
          {info && <p className="rounded-xl bg-brand-300/20 px-4 py-2.5 text-sm text-brand-50">{info}</p>}

          <Button type="submit" loading={busy} className="mt-2 h-12 w-full bg-brand-300 text-brand-800 shadow-[0_8px_24px_-8px_rgba(116,196,118,0.8)] hover:bg-brand-200">
            {mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="mt-5 text-sm text-brand-200 underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
        </button>
      </main>

      {/* Ondas decorativas, como na referência */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 w-full" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 120 C 240 40 420 190 720 120 S 1200 40 1440 130 V260 H0Z" fill="#238B45" fillOpacity="0.35" />
        <path d="M0 160 C 300 90 520 220 820 160 S 1220 100 1440 170 V260 H0Z" fill="#74C476" fillOpacity="0.28" />
        <path d="M0 200 C 260 160 560 250 860 200 S 1240 170 1440 210 V260 H0Z" fill="#EEF1EE" />
      </svg>
      <p className="relative z-10 pb-4 text-center text-xs text-brand-900/60">© Petrosupply · uso interno</p>
    </div>
  );
}
