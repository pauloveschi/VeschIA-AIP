import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa, useProdutoAtual } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, Check, Clock, Sparkles, X } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/solicitacoes/$id")({
  component: SolicitacaoDetailPage,
});

interface EtapaExecucao {
  id: string;
  status: string;
  decidido_em: string | null;
  comentario: string | null;
  configuracao_fluxo: {
    ordem: number;
    nome_etapa: string;
    responsavel_tipo: string;
    obrigatoria: boolean;
    papeis_empresa: { nome: string } | null;
  };
}

interface SolicitacaoDetail {
  id: string;
  numero: number;
  titulo: string;
  fornecedor_nome: string | null;
  valor: number | null;
  status: string;
  data_vencimento: string | null;
}

function useSolicitacaoDetail(id: string) {
  return useQuery({
    queryKey: ["solicitacao-detail", id],
    queryFn: async (): Promise<SolicitacaoDetail> => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select("id, numero, titulo, fornecedor_nome, valor, status, data_vencimento")
        .eq("id", id)
        .single();
      if (error) throw error;
      return { ...data, valor: data.valor != null ? Number(data.valor) : null };
    },
  });
}

function useEtapasExecucao(solicitacaoId: string, empresaId: string, produto: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["etapas-execucao", solicitacaoId],
    queryFn: async (): Promise<EtapaExecucao[]> => {
      // garante que existe uma linha de execução por etapa configurada (idempotente)
      const { data: configs, error: cErr } = await supabase
        .from("configuracao_fluxo")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("produto", produto)
        .eq("ativo", true);
      if (cErr) throw cErr;

      const { data: existentes, error: eErr } = await supabase
        .from("etapas_execucao")
        .select("configuracao_fluxo_id")
        .eq("solicitacao_id", solicitacaoId);
      if (eErr) throw eErr;

      const existentesIds = new Set((existentes ?? []).map((e) => e.configuracao_fluxo_id));
      const faltando = (configs ?? []).filter((c) => !existentesIds.has(c.id));
      if (faltando.length > 0) {
        await supabase.from("etapas_execucao").insert(
          faltando.map((c) => ({ solicitacao_id: solicitacaoId, configuracao_fluxo_id: c.id })),
        );
      }

      const { data, error } = await supabase
        .from("etapas_execucao")
        .select("id, status, decidido_em, comentario, configuracao_fluxo:configuracao_fluxo_id(ordem, nome_etapa, responsavel_tipo, obrigatoria, papeis_empresa:papel_id(nome))")
        .eq("solicitacao_id", solicitacaoId);
      if (error) throw error;
      return ((data ?? []) as unknown as EtapaExecucao[]).sort((a, b) => a.configuracao_fluxo.ordem - b.configuracao_fluxo.ordem);
    },
  });

  const decidir = useMutation({
    mutationFn: async ({ etapaId, status }: { etapaId: string; status: "aprovada" | "rejeitada" }) => {
      const { error } = await supabase
        .from("etapas_execucao")
        .update({ status, decidido_em: new Date().toISOString() })
        .eq("id", etapaId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["etapas-execucao", solicitacaoId] }),
  });

  return { ...query, decidir };
}

function EtapaIcon({ status }: { status: string }) {
  if (status === "aprovada") return <Check className="size-4" style={{ color: "#fff" }} />;
  if (status === "rejeitada") return <X className="size-4" style={{ color: "#fff" }} />;
  return <Clock className="size-4 text-muted-foreground" />;
}

function SolicitacaoDetailPage() {
  const { produto, empresa: empresaSlug } = Route.useParams();
  const empresa = useEmpresa();
  const prod = useProdutoAtual();
  const { id } = Route.useParams();
  const { data: solicitacao, isLoading } = useSolicitacaoDetail(id);
  const { data: etapas = [], isLoading: loadingEtapas, decidir } = useEtapasExecucao(id, empresa.id, prod);

  if (isLoading || loadingEtapas) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  if (!solicitacao) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Solicitação não encontrada.</div>;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header style={{ background: "var(--primary)" }}>
        <div className="max-w-3xl mx-auto px-5 py-3.5">
          <Link
            to="/$produto/$empresa"
            params={{ produto, empresa: empresaSlug }}
            className="text-[13px] flex items-center gap-1 text-primary-foreground/70 hover:text-primary-foreground w-fit"
          >
            <ChevronLeft className="size-3.5" /> Voltar
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        <p className="text-[12px] text-muted-foreground">Solicitação #{solicitacao.numero}</p>
        <h1 className="text-xl font-semibold mt-1">{solicitacao.titulo}</h1>
        {solicitacao.fornecedor_nome && <p className="text-sm text-muted-foreground mt-0.5">{solicitacao.fornecedor_nome}</p>}
        {solicitacao.valor != null && (
          <p className="text-lg font-semibold mt-2" style={{ color: "var(--accent)" }}>
            {solicitacao.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        )}

        <div className="mt-6 space-y-2">
          {etapas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etapa de aprovação configurada pra esse produto ainda.</p>
          ) : (
            etapas.map((etapa) => {
              const isIa = etapa.configuracao_fluxo.responsavel_tipo === "ia";
              const isPendente = etapa.status === "pendente";
              const bg =
                etapa.status === "aprovada" ? "var(--ops-aprovada)" : etapa.status === "rejeitada" ? "var(--ops-rejeitada)" : "var(--muted)";
              return (
                <div key={etapa.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                  <div
                    className="size-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: isPendente ? "var(--secondary)" : bg }}
                  >
                    {isIa ? <Sparkles className="size-4" style={{ color: isPendente ? "var(--accent)" : "#fff" }} /> : <EtapaIcon status={etapa.status} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{etapa.configuracao_fluxo.nome_etapa}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {isIa ? "Responsável: IA" : etapa.configuracao_fluxo.papeis_empresa?.nome ?? "Papel não definido"}
                      {!etapa.configuracao_fluxo.obrigatoria && " · opcional"}
                    </p>
                  </div>
                  {isPendente && !isIa && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30" onClick={() => decidir.mutate({ etapaId: etapa.id, status: "rejeitada" })}>
                        Rejeitar
                      </Button>
                      <Button size="sm" className="h-8 bg-primary text-primary-foreground" onClick={() => decidir.mutate({ etapaId: etapa.id, status: "aprovada" })}>
                        Aprovar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
