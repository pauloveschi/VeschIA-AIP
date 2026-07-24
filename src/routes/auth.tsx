import * as React from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

interface Search {
  redirect?: string;
  mode?: "signin" | "signup";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    mode: s.mode === "signup" ? "signup" : "signin",
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = useSearch({ from: "/auth" });
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
      navigate({ to: search.redirect ?? "/superadmin" });
    }
  }, [user, navigate, search.redirect]);

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
    <div className="veschia-shell min-h-svh px-6 py-16">
      <div className="max-w-sm mx-auto">
        <img src={logo} alt="VeschIA" className="h-10 mb-6" />
        <h1 className="text-2xl font-semibold">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
        <p className="text-xs mt-1" style={{ color: "var(--vs-text-muted)" }}>Acesso interno da equipe VeschIA.</p>

        <div className="mt-5 inline-flex p-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn("px-4 h-8 rounded-full text-[12px] transition-all")}
              style={mode === m ? { background: "var(--vs-cyan)", color: "#04202B" } : { color: "var(--vs-text-muted)" }}
            >
              {m === "signin" ? "Entrar" : "Cadastrar"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider" style={{ color: "var(--vs-text-muted)" }}>Nome completo</Label>
              <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider" style={{ color: "var(--vs-text-muted)" }}>E-mail</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider" style={{ color: "var(--vs-text-muted)" }}>Senha</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </div>
          {error && <p className="text-[12px]" style={{ color: "#F87171" }}>{error}</p>}
          <Button type="submit" disabled={loading} className="w-full h-12 rounded-full mt-2" style={{ background: "var(--vs-cyan)", color: "#04202B" }}>
            {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <p className="text-[11px] mt-4 text-center" style={{ color: "var(--vs-text-muted)" }}>
          <Link to="/" className="hover:underline">← Voltar</Link>
        </p>
      </div>
    </div>
  );
}
