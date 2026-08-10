import * as React from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useEmpresaOpcional } from "@/lib/empresa";
import { cn } from "@/lib/utils";

interface Search {
  redirect?: string;
  mode?: "signin" | "signup";
}

export const Route = createFileRoute("/$produto/$empresa/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    mode: s.mode === "signup" ? "signup" : "signin",
  }),
  component: AuthPage,
});

function AuthPage() {
  // Deslogado, o RLS não devolve a empresa — daí o acessor opcional. O slug vem da URL,
  // que é o que o redirect pós-login precisa; o nome é só enfeite e some se não veio.
  const empresa = useEmpresaOpcional();
  const { produto, empresa: empresaSlug } = Route.useParams();
  const search = useSearch({ from: "/$produto/$empresa/auth" });
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();
  const [mode, setMode] = React.useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      navigate({ to: search.redirect ?? "/$produto/$empresa", params: { produto, empresa: empresaSlug } });
    }
  }, [user, navigate, search.redirect, produto, empresaSlug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-svh bg-background text-foreground max-w-md mx-auto">
      <section className="px-5 pt-8">
        {empresa && (
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{empresa.nome}</p>
        )}
        <h1 className="text-2xl font-semibold mt-1">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>

        <div className="mt-5 inline-flex p-1 rounded-full bg-secondary">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-4 h-8 rounded-full text-[12px] transition-all",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {m === "signin" ? "Entrar" : "Cadastrar"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider">Nome completo</Label>
              <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider">E-mail</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider">Senha</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </div>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full h-12 rounded-full bg-primary mt-2">
            {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          <Link to="/" className="hover:text-foreground">← Voltar</Link>
        </p>
      </section>
    </div>
  );
}
