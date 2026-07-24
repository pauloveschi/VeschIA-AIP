import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa, useProdutoAtual } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Check, Clock, Sparkles, X, Cog } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/solicitacoes/$id")({
  component: SolicitacaoDetailPage,
});

interface FaixaValor {
  valor_max: number | null;
  aprovadores: string[];
}

interface CondicaoAprovacaoPorValor {
  tipo: "aprovacao_por_valor";
  faixas: FaixaValor[];
  aprovador_extra_se_papel_existir?: string;
}

interface ConfigFluxo {
  id: string;
  ordem: number;
  nome_etapa: string;
  responsavel_tipo: string;
  obrigatoria: boolean;
  papel_id: string | null;
  condicao: CondicaoAprovacaoPorValor | null;
}

interface EtapaExecucao {
  id: string;
  status: string;
  papel_resolvido_id: string | null;
  configuracao_fluxo: {
    ordem: number;
    nome_etapa: string;
    responsavel_tipo: string;
    obrigatoria: boolean;
    papeis_empresa: { nome: string } | null;
  };
  papel_resolvido: { nome: string } | null;
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

interface Papel {
  id: string;
  nome: string;
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

/** Decide quais papéis aprovam uma etapa com condição de valor (ex: Aprovação Interna). */
function resolverAprovadoresPorValor(condicao: CondicaoAprovacaoPorValor, valor: number | null, papeisDisponiveis: Papel[]): string[] {
  const v = valor ?? 0;
  const faixa =
    condicao.faixas.find((f) => f.valor_max != null && v <= f.valor_max) ??
    condicao.faixas.find((f) => f.valor_max == null) ??
    condicao.faixas[0];

  const nomes = new Set(faixa?.aprovadores ?? []);
  const extra = condicao.aprovador_extra_se_papel_existir;
  if (extra && papeisDisponiveis.some((p) => p.nome === extra)) {
    nomes.add(extra);
  }
  return Array.from(nomes);
}

function useEtapasExecucao(solicitacaoId: string, empresaId: string, produto: string, valor: number | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["etapas-execucao", solicitacaoId],
    queryFn: async (): Promise<EtapaExecucao[]> => {
      const { data: configs, error: cErr } = await supabase
        .from("configuracao_fluxo")
        .select("id, ordem, nome_etapa, responsavel_tipo, obrigatoria, papel_id, condicao")
        .eq("empresa_id", empresaId)
        .eq("produto", produto)
        .eq("ativo", true);
      if (cErr) throw cErr;

      const { data: papeis, error: pErr } = await supabase.from("papeis_empresa").select("id, nome").eq("empresa_id", empresaId);
      if (pErr) throw pErr;

      const { data: existentes, error: eErr } = await supabase
        .from("etapas_execucao")
        .select("configuracao_fluxo_id")
        .eq("solicitacao_id", solicitacaoId);
      if (eErr) throw eErr;

      const existentesIds = new Set((existentes ?? []).map((e) => e.configuracao_fluxo_id));
      const faltando = ((configs ?? []) as ConfigFluxo[]).filter((c) => !existentesIds.has(c.id));

      if (faltando.length > 0) {
        const novasLinhas: { solicitacao_id: string; configuracao_fluxo_id: string; papel_resolvido_id: string | null }[] = [];

        for (const config of faltando) {
          if (config.responsavel_tipo === "papel" && config.condicao?.tipo === "aprovacao_por_valor") {
            // etapa com regra de valor: pode virar 1, 2 ou 3 linhas (um aprovador cada)
            const nomesAprovadores = resolverAprovadoresPorValor(config.condicao, valor, papeis ?? []);
            const idsResolvidos = nomesAprovadores
              .map((nome) => (papeis ?? []).find((p) => p.nome === nome)?.id)
              .filter((id): id is string => !!id);

            if (idsResolvidos.length > 0) {
              for (const papelId of idsResolvidos) {
                novasLinhas.push({ solicitacao_id: solicitacaoId, configuracao_fluxo_id: config.id, papel_resolvido_id: papelId });
              }
            } else {
              // nenhum papel cadastrado bate com o nome esperado; cria mesmo assim, sem papel resolvido
              novasLinhas.push({ solicitacao_id: solicitacaoId, configuracao_fluxo_id: config.id, papel_resolvido_id: null });
            }
          } else {
            novasLinhas.push({ solicitacao_id: solicitacaoId, configuracao_fluxo_id: config.id, papel_resolvido_id: null });
          }
        }

        await supabase.from("etapas_execucao").insert(novasLinhas);
      }

      const { data, error } = await supabase
        .from("etapas_execucao")
        .select(
          "id, status, papel_resolvido_id, configuracao_fluxo:configuracao_fluxo_id(ordem, nome_etapa, responsavel_tipo, obrigatoria, papeis_empresa:papel_id(nome)), papel_resolvido:papel_resolvido_id(nome)",
        )
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
  const { data: etapas = [], isLoading: loadingEtapas, decidir } = useEtapasExecucao(id, empresa.id, prod, solicitacao?.valor ?? null);

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
              const isSistema = etapa.configuracao_fluxo.responsavel_tipo === "sistema";
              const isPendente = etapa.status === "pendente";
              const bg =
                etapa.status === "aprovada" ? "var(--ops-aprovada)" : etapa.status === "rejeitada" ? "var(--ops-rejeitada)" : "var(--muted)";
              const nomeResponsavel = etapa.papel_resolvido?.nome ?? etapa.configuracao_fluxo.papeis_empresa?.nome ?? null;
              return (
                <div key={etapa.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                  <div
                    className="size-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: isPendente ? "var(--secondary)" : bg }}
                  >
                    {isIa ? (
                      <Sparkles className="size-4" style={{ color: isPendente ? "var(--accent)" : "#fff" }} />
                    ) : isSistema ? (
                      <Cog className="size-4" style={{ color: isPendente ? "var(--muted-foreground)" : "#fff" }} />
                    ) : (
                      <EtapaIcon status={etapa.status} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{etapa.configuracao_fluxo.nome_etapa}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {isIa ? "Responsável: IA" : isSistema ? "Automático" : `Responsável: ${nomeResponsavel ?? "não definido"}`}
                      {!etapa.configuracao_fluxo.obrigatoria && " · opcional"}
                    </p>
                  </div>
                  {isPendente && !isIa && !isSistema && (
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
