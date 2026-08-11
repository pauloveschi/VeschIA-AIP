import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useEmpresa, useProdutoAtual } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Check, Clock, Sparkles, X, Cog, ArrowUpRight, Mail, SkipForward, ChevronLeft } from "lucide-react";

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
  descricao: string | null;
  area: string | null;
  centro_custo: string | null;
  fornecedor_nome: string | null;
  valor: number | null;
  status: string;
  data_vencimento: string | null;
}

interface Papel {
  id: string;
  nome: string;
}


const notificarSchema = z.object({ etapaExecucaoId: z.string(), solicitacaoId: z.string() });

/**
 * Reenvia o aviso de uma etapa: apaga o registro de "já avisei" e deixa o motor
 * mandar de novo, do jeito certo pro tipo da etapa (decisão ou trabalho).
 */
const reenviarAviso = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => notificarSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { avancarFluxo } = await import("@/motor.server");

    await supabaseAdmin.from("aprovacao_tokens").delete().eq("etapa_execucao_id", data.etapaExecucaoId);
    const resultado = await avancarFluxo(supabaseAdmin, data.solicitacaoId);

    if (!resultado.avisoEnviadoPara) {
      throw new Error("Não foi possível enviar: verifique se o papel responsável tem e-mail cadastrado na Configuração do fluxo.");
    }
    return { enviadoPara: resultado.avisoEnviadoPara };
  });

const motorSchema = z.object({ solicitacaoId: z.string() });

/** Chama o motor pra empurrar o fluxo o quanto der sem intervenção humana. */
const rodarMotor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => motorSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { avancarFluxo } = await import("@/motor.server");
    return avancarFluxo(supabaseAdmin, data.solicitacaoId);
  });

function useSolicitacaoDetail(id: string) {
  return useQuery({
    queryKey: ["solicitacao-detail", id],
    queryFn: async (): Promise<SolicitacaoDetail> => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select("id, numero, titulo, descricao, area, centro_custo, fornecedor_nome, valor, status, data_vencimento")
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

function useEtapasExecucao(solicitacaoId: string, empresaId: string, produto: string, valor: number | null, solicitacaoCarregada: boolean) {
  const qc = useQueryClient();
  const query = useQuery({
    enabled: solicitacaoCarregada,
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

      // Deixa o motor empurrar o que for automático antes de desenhar a tela.
      await rodarMotor({ data: { solicitacaoId } });

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
    mutationFn: async ({ etapaId, status }: { etapaId: string; status: "aprovada" | "rejeitada" | "pulada" }) => {
      const { error } = await supabase
        .from("etapas_execucao")
        .update({ status, decidido_em: new Date().toISOString() })
        .eq("id", etapaId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await rodarMotor({ data: { solicitacaoId } });
      qc.invalidateQueries({ queryKey: ["etapas-execucao", solicitacaoId] });
      qc.invalidateQueries({ queryKey: ["solicitacao-detail", solicitacaoId] });
    },
  });

  return { ...query, decidir };
}


/** Botão que dispara (ou reenvia) o aviso por e-mail pro responsável da etapa. */
function BotaoNotificar({ etapaId, solicitacaoId }: { etapaId: string; solicitacaoId: string }) {
  const [msg, setMsg] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const notificarMut = useMutation({
    mutationFn: async () => reenviarAviso({ data: { etapaExecucaoId: etapaId, solicitacaoId } }),
    onSuccess: (res) => {
      setErro(null);
      setMsg(`E-mail enviado para ${res.enviadoPara}`);
    },
    onError: (e: Error) => {
      setMsg(null);
      setErro(e.message);
    },
  });

  return (
    <div className="shrink-0 text-right">
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={notificarMut.isPending}
        onClick={() => notificarMut.mutate()}
        title="Reenviar o aviso por e-mail ao responsável"
      >
        <Mail className="size-3.5 mr-1" /> {notificarMut.isPending ? "Enviando…" : "Reenviar aviso"}
      </Button>
      {msg && <p className="text-[11px] text-muted-foreground mt-1">{msg}</p>}
      {erro && <p className="text-[11px] text-destructive mt-1 max-w-52">{erro}</p>}
    </div>
  );
}

function EtapaIcon({ status }: { status: string }) {
  if (status === "aprovada") return <Check className="size-4" style={{ color: "#fff" }} />;
  if (status === "rejeitada") return <X className="size-4" style={{ color: "#fff" }} />;
  if (status === "pulada") return <SkipForward className="size-4" style={{ color: "#fff" }} />;
  return <Clock className="size-4 text-muted-foreground" />;
}

function SolicitacaoDetailPage() {
  const { produto, empresa: empresaSlug, id } = Route.useParams();
  const empresa = useEmpresa();
  const prod = useProdutoAtual();
  const { data: solicitacao, isLoading } = useSolicitacaoDetail(id);
  const { data: etapas = [], isLoading: loadingEtapas, decidir } = useEtapasExecucao(id, empresa.id, prod, solicitacao?.valor ?? null, !!solicitacao);

  if (isLoading || loadingEtapas) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  if (!solicitacao) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Solicitação não encontrada.</div>;
  }

  return (
    <main className="max-w-3xl mx-auto px-5 py-6">
        {/* Mesmo padrão da tela de contrato: o menu lateral leva pra lista, mas o item
            aparece aceso aqui dentro, então não se lê como caminho de volta. */}
        <Link
          to="/$produto/$empresa"
          params={{ produto, empresa: empresaSlug }}
          search={{ status: undefined, busca: undefined }}
          className="text-[13px] flex items-center gap-1 text-muted-foreground hover:text-foreground w-fit mb-3"
        >
          <ChevronLeft className="size-3.5" /> Voltar pra solicitações
        </Link>

        <p className="text-[12px] text-muted-foreground">Solicitação #{solicitacao.numero}</p>
        <h1 className="text-xl font-semibold mt-1">{solicitacao.titulo}</h1>
        {solicitacao.area && <p className="text-sm text-muted-foreground mt-0.5">{solicitacao.area}{solicitacao.centro_custo ? ` · ${solicitacao.centro_custo}` : ""}</p>}
        {solicitacao.descricao && <p className="text-sm mt-2">{solicitacao.descricao}</p>}
        {solicitacao.fornecedor_nome && <p className="text-sm text-muted-foreground mt-2">Fornecedor escolhido: {solicitacao.fornecedor_nome}</p>}
        {solicitacao.valor != null && (
          <p className="text-lg font-semibold mt-2" style={{ color: "var(--accent)" }}>
            {solicitacao.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        )}

        <div className="mt-6 space-y-2">
          {etapas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etapa de aprovação configurada pra esse produto ainda.</p>
          ) : (
            etapas.map((etapa, index) => {
              const isIa = etapa.configuracao_fluxo.responsavel_tipo === "ia";
              const isSistema = etapa.configuracao_fluxo.responsavel_tipo === "sistema";
              const isNegociacao = etapa.configuracao_fluxo.nome_etapa === "Negociação Comercial";
              const isElaboracaoContrato = etapa.configuracao_fluxo.nome_etapa === "Elaboração do Contrato";
              const isDecisaoCustomizada =
                etapa.configuracao_fluxo.nome_etapa === "Renovação ou Encerramento" ||
                etapa.configuracao_fluxo.nome_etapa === "Validação Jurídica";
              const isPendente = etapa.status === "pendente";
              // Qualquer etapa ainda pendente trava as seguintes, obrigatória ou não.
              // Etapa opcional que não se aplica àquela solicitação deve ser pulada
              // de forma explícita (botão "Pular etapa"), não ignorada em silêncio.
              const etapaAnteriorPendente = etapas.slice(0, index).some((anterior) => anterior.status === "pendente");
              const bg =
                etapa.status === "aprovada"
                  ? "var(--ops-aprovada)"
                  : etapa.status === "rejeitada"
                    ? "var(--ops-rejeitada)"
                    : etapa.status === "pulada"
                      ? "var(--muted-foreground)"
                      : "var(--muted)";
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
                      {etapa.status === "pulada" && " · pulada nesta solicitação"}
                      {isPendente && etapaAnteriorPendente && " · aguardando etapa anterior"}
                      {isPendente && !etapaAnteriorPendente && isDecisaoCustomizada && " · decisão feita pelo link de e-mail"}
                    </p>
                  </div>
                  {isNegociacao && isPendente && !etapaAnteriorPendente && (
                    <Link
                      to="/$produto/$empresa/negociacao/$id"
                      params={{ produto, empresa: empresaSlug, id }}
                      className="shrink-0"
                    >
                      <Button size="sm" className="h-8" variant="confirmar">
                        Gerenciar negociação <ArrowUpRight className="size-3.5 ml-1" />
                      </Button>
                    </Link>
                  )}
                  {isElaboracaoContrato && isPendente && !etapaAnteriorPendente && (
                    <Link
                      to="/$produto/$empresa/contrato/$id"
                      params={{ produto, empresa: empresaSlug, id }}
                      className="shrink-0"
                    >
                      <Button size="sm" className="h-8" variant="confirmar">
                        Elaborar contrato <ArrowUpRight className="size-3.5 ml-1" />
                      </Button>
                    </Link>
                  )}
                  {isPendente && !etapa.configuracao_fluxo.obrigatoria && !etapaAnteriorPendente && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 text-muted-foreground"
                      title="Marcar como não aplicável nesta solicitação"
                      onClick={() => decidir.mutate({ etapaId: etapa.id, status: "pulada" })}
                    >
                      <SkipForward className="size-3.5 mr-1" /> Pular etapa
                    </Button>
                  )}
                  {isPendente && !isIa && !isSistema && !isElaboracaoContrato && !etapaAnteriorPendente && (
                    <BotaoNotificar etapaId={etapa.id} solicitacaoId={id} />
                  )}
                  {isPendente && !isIa && !isSistema && !isNegociacao && !isElaboracaoContrato && !isDecisaoCustomizada && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="recusarOutline"
                        className="h-8"
                        disabled={etapaAnteriorPendente}
                        onClick={() => decidir.mutate({ etapaId: etapa.id, status: "rejeitada" })}
                      >
                        Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        className="h-8" variant="confirmar"
                        disabled={etapaAnteriorPendente}
                        onClick={() => decidir.mutate({ etapaId: etapa.id, status: "aprovada" })}
                      >
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
  );
}
