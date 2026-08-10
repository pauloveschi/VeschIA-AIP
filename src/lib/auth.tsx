import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = React.createContext<AuthCtx | null>(null);

let avisoStorageDeSessaoEmitido = false;

/**
 * Trava barata contra regressão silenciosa: `client.ts` é gerado (Supabase/Lovable), e a
 * troca de `localStorage` por `sessionStorage` (ver CLAUDE.md, "Conventions to keep") some
 * numa regeneração sem erro de tipo nem de lint — o sintoma (sessão sobrevive ao fechar a
 * aba) só apareceria bem depois, sem ligação óbvia com a causa.
 *
 * `auth.storage` é uma propriedade real do GoTrueClient em runtime; o `.d.ts` público só a
 * marca como `protected` pro TypeScript, então o cast abaixo é legítimo, não um jeito de
 * calar um erro real. Comparamos identidade com `window.sessionStorage` diretamente — é
 * mais confiável do que checar se existe alguma chave de sessão em `localStorage`, que só
 * mudaria depois de alguém logar (e não pega o caso de ninguém ter aberto o sistema ainda).
 */
function verificarStorageDeSessao() {
  if (avisoStorageDeSessaoEmitido || typeof window === "undefined") return;
  avisoStorageDeSessaoEmitido = true;

  const storageEmUso = (supabase.auth as unknown as { storage?: Storage }).storage;
  if (storageEmUso !== window.sessionStorage) {
    console.warn(
      `[Supabase] auth.storage não é sessionStorage — a configuração em ` +
        `src/integrations/supabase/client.ts provavelmente foi perdida numa regeneração ` +
        `(Supabase codegen ou resync da Lovable Cloud). Reaplique a linha do "storage: sessionStorage" ` +
        `e veja CLAUDE.md > Conventions to keep, not "fix".`,
    );
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    verificarStorageDeSessao();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        data: { full_name: fullName },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}