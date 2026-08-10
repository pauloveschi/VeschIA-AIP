import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { useEmpresa, useProdutoAtual, useProdutoContratado, produtoInfo } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/")({
  component: DashboardPage,
});

interface Solicitacao {
  id: string;
  numero: number;
  titulo: string;
  area: string | null;
  fornecedor_nome: string | null;
  valor: number | null;
  status: string;
  data_vencimento: string | null;
  created_at: string | null;
}

const statusMeta: Record<string, { label: string; fg: string; bg: string }> = {
  aberta: { label: "Aberta", fg: "var(--ops-aberta)", bg: "var(--ops-aberta-bg)" },
  em_analise: { label: "Em análise", fg: "var(--ops-em-analise)", bg: "var(--ops-em-analise-bg)" },
  ajuste_solicitado: { label: "Ajuste solicitado", fg: "var(--ops-em-analise)", bg: "var(--ops-em-analise-bg)" },
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


const motorSchema = z.object({ solicitacaoId: z.string() });

/** Chama o motor pra empurrar o fluxo assim que a solicitação nasce. */
const rodarMotor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => motorSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { avancarFluxo } = await import("@/motor.server");
    return avancarFluxo(supabaseAdmin, data.solicitacaoId);
  });

function useSolicitacoes(empresaId: string, produto: string) {
  return useQuery({
    queryKey: ["solicitacoes", empresaId, produto],
    queryFn: async (): Promise<Solicitacao[]> => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select("id, numero, titulo, area, fornecedor_nome, valor, status, data_vencimento, created_at")
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
  const [descricao, setDescricao] = React.useState("");
  const [area, setArea] = React.useState("");
  const [centroCusto, setCentroCusto] = React.useState("");
  const { user } = useAuth();

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: criada, error } = await supabase
        .from("solicitacoes")
        .insert({
          empresa_id: empresaId,
          produto,
          titulo,
          descricao: descricao || null,
          area: area || null,
          centro_custo: centroCusto || null,
          solicitante_id: user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (criada?.id) await rodarMotor({ data: { solicitacaoId: criada.id } });
    },
    onSuccess: () => {
      setTitulo("");
      setDescricao("");
      setArea("");
      setCentroCusto("");
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
      <Textarea placeholder="Descrição (o que a área precisa e por quê)" value={descricao} onChange={(e) => setDescricao(e.target.value)} className="min-h-20" />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Área" value={area} onChange={(e) => setArea(e.target.value)} className="h-9" />
        <Input placeholder="Centro de custo" value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} className="h-9" />
      </div>
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
  const { user, loading: authLoading } = useAuth();
  const { data: contratado, isLoading: checkingEntitlement } = useProdutoContratado();
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
    <main className="max-w-6xl mx-auto px-5 py-6 space-y-3">
      <h1 className="text-xl font-semibold">Solicitações</h1>
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
                {s.area && <p className="text-[12.5px] text-muted-foreground">{s.area}</p>}
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
  );
}
