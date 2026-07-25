import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useEmpresa, useProdutoAtual, useProdutoContratado, useIsEmpresaStaff, produtoInfo } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { LogOut, Settings2, Plus, FileText, FileStack } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/")({
  component: DashboardPage,
});

interface Solicitacao {
  id: string;
  numero: number;
  titulo: string;
  fornecedor_nome: string | null;
  valor: number | null;
  status: string;
  data_vencimento: string | null;
  created_at: string | null;
}

const statusMeta: Record<string, { label: string; fg: string; bg: string }> = {
  aberta: { label: "Aberta", fg: "var(--ops-aberta)", bg: "var(--ops-aberta-bg)" },
  em_analise: { label: "Em análise", fg: "var(--ops-em-analise)", bg: "var(--ops-em-analise-bg)" },
  aprovada: { label: "Aprovada", fg: "var(--ops-aprovada)", bg: "var(--ops-aprovada-bg)" },
  rejeitada: { label: "Rejeitada", fg: "var(--ops-rejeitada)", bg: "var(--ops-rejeitada-bg)" },
  assinada: { label: "Assinada", fg: "var(--ops-assinada)", bg: "var(--ops-assinada-bg)" },
  encerrada: { label: "Encerrada", fg: "var(--ops-encerrada)", bg: "var(--ops-encerrada-bg)" },
  cancelada: { label: "Cancelada", fg: "var(--ops-cancelada)", bg: "var(--ops-cancelada-bg)" },
};

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta[status] ?? statusMeta.aberta;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold" style={{ color: m.fg, background: m.bg }}>
      {m.label}
    </span>
  );
}

function useSolicitacoes(empresaId: string, produto: string) {
  return useQuery({
    queryKey: ["solicitacoes", empresaId, produto],
    queryFn: async (): Promise<Solicitacao[]> => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select("id, numero, titulo, fornecedor_nome, valor, status, data_vencimento, created_at")
        .eq("empresa_id", empresaId)
        .eq("produto", produto)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => ({ ...s, valor: s.valor != null ? Number(s.valor) : null }));
    },
  });
}

function NewSolicitacaoForm({ empresaId, produto, onCreated }: { empresaId: string; produto: string; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [titulo, setTitulo] = React.useState("");
  const [fornecedor, setFornecedor] = React.useState("");
  const [valor, setValor] = React.useState<number | null>(null);
  const { user } = useAuth();

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("solicitacoes").insert({
        empresa_id: empresaId,
        produto,
        titulo,
        fornecedor_nome: fornecedor || null,
        valor,
        solicitante_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitulo("");
      setFornecedor("");
      setValor(null);
      setOpen(false);
      onCreated();
    },
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="h-9 px-4 text-sm bg-primary text-primary-foreground">
        <Plus className="size-4 mr-1" /> Nova solicitação
      </Button>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-2.5 bg-card">
      <h3 className="text-sm font-medium">Nova solicitação</h3>
      <Input placeholder="Título (ex: Manutenção predial)" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9" />
      <Input placeholder="Fornecedor / contraparte" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className="h-9" />
      <CurrencyInput valueReais={valor} onChangeReais={setValor} className="h-9" />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button size="sm" disabled={!titulo || createMut.isPending} onClick={() => createMut.mutate()} className="bg-primary text-primary-foreground">
          Criar
        </Button>
      </div>
    </div>
  );
}

function DashboardPage() {
  const empresa = useEmpresa();
  const produto = useProdutoAtual();
  const info = produtoInfo(produto)!;
  const { user, loading: authLoading, signOut } = useAuth();
  const { data: contratado, isLoading: checkingEntitlement } = useProdutoContratado();
  const { isStaff } = useIsEmpresaStaff();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: solicitacoes = [], isLoading } = useSolicitacoes(empresa.id, produto);

  if (authLoading) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-svh grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">{empresa.nome}</h1>
          <p className="text-sm text-muted-foreground mt-2">Faça login para acessar {info.nome}.</p>
          <Link
            to="/$produto/$empresa/auth"
            params={{ produto, empresa: empresa.slug }}
            search={{ redirect: `/${produto}/${empresa.slug}`, mode: "signin" }}
            className="inline-flex mt-4 h-11 px-6 rounded-full bg-primary text-primary-foreground items-center text-sm"
          >
            Entrar
          </Link>
        </div>
      </div>
    );
  }

  if (checkingEntitlement) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Verificando acesso…</div>;
  }

  if (!contratado) {
    return (
      <div className="min-h-svh grid place-items-center px-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-semibold">Produto não contratado</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {empresa.nome} ainda não tem acesso a {info.nome}. Fale com o VeschIA pra contratar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 backdrop-blur border-b border-border" style={{ background: "var(--primary)" }}>
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
              {info.nome} · {empresa.nome}
            </p>
            <h1 className="text-[19px] font-semibold leading-tight text-primary-foreground">Solicitações</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/$produto/$empresa/contratos"
              params={{ produto, empresa: empresa.slug }}
              className="text-[13px] flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground"
            >
              <FileStack className="size-3.5" /> Contratos
            </Link>
            {isStaff && (
              <Link
                to="/$produto/$empresa/configuracao"
                params={{ produto, empresa: empresa.slug }}
                className="text-[13px] flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground"
              >
                <Settings2 className="size-3.5" /> Configuração
              </Link>
            )}
            <button
              onClick={async () => { await signOut(); navigate({ to: "/" }); }}
              className="text-[13px] flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground"
            >
              <LogOut className="size-3.5" /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-3">
        <NewSolicitacaoForm empresaId={empresa.id} produto={produto} onCreated={() => qc.invalidateQueries({ queryKey: ["solicitacoes", empresa.id, produto] })} />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : solicitacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação ainda.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {solicitacoes.map((s) => (
              <Link
                key={s.id}
                to="/$produto/$empresa/solicitacoes/$id"
                params={{ produto, empresa: empresa.slug, id: s.id }}
                className="rounded-xl border border-border bg-card p-4 hover:border-ring transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] text-muted-foreground">#{s.numero}</span>
                  <StatusBadge status={s.status} />
                </div>
                <h3 className="text-[15px] font-semibold mt-1.5 flex items-center gap-1.5">
                  <FileText className="size-3.5 text-muted-foreground" /> {s.titulo}
                </h3>
                {s.fornecedor_nome && <p className="text-[12.5px] text-muted-foreground">{s.fornecedor_nome}</p>}
                {s.valor != null && (
                  <p className="mt-2 font-semibold" style={{ color: "var(--accent)" }}>
                    {s.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
