import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useEmpresa, useProdutoAtual } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Check, Clock, Sparkles, X, Cog, ArrowUpRight, Mail } from "lucide-react";

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


const notificarSchema = z.object({ etapaExecucaoId: z.string() });

/**
 * Manda o aviso por e-mail pro papel responsável por uma etapa pendente.
 * Gera um token de uso único (7 dias) que abre a tela pública de aprovação,
 * pra o aprovador poder decidir mesmo sem ter conta no sistema.
 */
const notificarAprovador = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => notificarSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: etapa } = await supabaseAdmin
      .from("etapas_execucao")
      .select(
        "id, status, solicitacao_id, papel_resolvido_id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa, papel_id)",
      )
      .eq("id", data.etapaExecucaoId)
      .single();
    if (!etapa) throw new Error("Etapa não encontrada.");
    if (etapa.status !== "pendente") throw new Error("Essa etapa já foi decidida.");

    const papelId = etapa.papel_resolvido_id ?? (etapa as any).configuracao_fluxo?.papel_id;
    if (!papelId) throw new Error("Essa etapa não tem papel responsável definido.");

    const { data: papel } = await supabaseAdmin.from("papeis_empresa").select("nome, email").eq("id", papelId).single();
    if (!papel?.email) throw new Error(`O papel ${papel?.nome ?? ""} não tem e-mail cadastrado. Defina em Configuração do fluxo.`);

    const { data: solicitacao } = await supabaseAdmin
      .from("solicitacoes")
      .select("numero, titulo, valor, fornecedor_nome, empresa_id")
      .eq("id", etapa.solicitacao_id)
      .single();

    const { data: empresa } = await supabaseAdmin
      .from("empresas_clientes")
      .select("nome")
      .eq("id", solicitacao?.empresa_id ?? "")
      .maybeSingle();

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: eToken } = await supabaseAdmin.from("aprovacao_tokens").insert({
      token,
      etapa_execucao_id: etapa.id,
      enviado_para: papel.email,
      expira_em: expiraEm,
    });
    if (eToken) throw new Error("Não foi possível gerar o link de aprovação.");

    const base = process.env.APP_BASE_URL || "https://veschia-aip.vercel.app";
    const linkAprovar = `${base}/aprovacao/${token}?acao=aprovar`;
    const linkRejeitar = `${base}/aprovacao/${token}?acao=rejeitar`;

    const nomeEtapa = (etapa as any).configuracao_fluxo?.nome_etapa ?? "Aprovação";
    const valorFmt =
      solicitacao?.valor != null
        ? Number(solicitacao.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : null;

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #16233a; line-height: 1.55;">
        <p style="font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #6b7a90; margin: 0 0 4px;">
          VeschIA AIP · ${empresa?.nome ?? ""}
        </p>
        <h2 style="margin: 0 0 14px; font-size: 18px;">${nomeEtapa}: sua aprovação foi solicitada</h2>
        <p style="margin: 0 0 6px;">Olá, ${papel.nome}.</p>
        <p style="margin: 0 0 14px;">A solicitação abaixo está aguardando sua decisão:</p>
        <table style="border-collapse: collapse; margin: 0 0 18px;">
          <tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Solicitação</td><td style="padding: 3px 0;">#${solicitacao?.numero} · ${solicitacao?.titulo ?? ""}</td></tr>
          ${solicitacao?.fornecedor_nome ? `<tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Fornecedor</td><td style="padding: 3px 0;">${solicitacao.fornecedor_nome}</td></tr>` : ""}
          ${valorFmt ? `<tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Valor</td><td style="padding: 3px 0; font-weight: bold;">${valorFmt}</td></tr>` : ""}
        </table>
        <p style="margin: 0 0 4px; font-weight: bold; color: #16233a;">Para aprovar:</p>
        <p style="margin: 0 0 14px;"><a href="${linkAprovar}" style="color: #1a73e8;">Clique aqui para aprovar esta solicitação</a></p>
        <p style="margin: 0 0 4px; font-weight: bold; color: #16233a;">Para rejeitar:</p>
        <p style="margin: 0 0 18px;"><a href="${linkRejeitar}" style="color: #1a73e8;">Clique aqui para rejeitar esta solicitação</a></p>
        <p style="margin: 0; font-size: 12px; color: #6b7a90;">
          Os links abrem uma tela com os detalhes, onde você confirma a decisão. Válidos por 7 dias e por um único uso.
        </p>
      </div>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "VeschIA AIP <onboarding@resend.dev>",
        to: [papel.email],
        subject: `${nomeEtapa}: solicitação #${solicitacao?.numero} aguarda sua decisão`,
        html,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Erro ao enviar o e-mail (${resp.status}): ${txt.slice(0, 200)}`);
    }

    return { enviadoPara: papel.email };
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


/** Botão que dispara (ou reenvia) o aviso por e-mail pro responsável da etapa. */
function BotaoNotificar({ etapaId }: { etapaId: string }) {
  const [msg, setMsg] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const notificarMut = useMutation({
    mutationFn: async () => notificarAprovador({ data: { etapaExecucaoId: etapaId } }),
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
        title="Enviar aviso por e-mail ao responsável"
      >
        <Mail className="size-3.5 mr-1" /> {notificarMut.isPending ? "Enviando…" : "Avisar por e-mail"}
      </Button>
      {msg && <p className="text-[11px] text-muted-foreground mt-1">{msg}</p>}
      {erro && <p className="text-[11px] text-destructive mt-1 max-w-52">{erro}</p>}
    </div>
  );
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
  const { data: etapas = [], isLoading: loadingEtapas, decidir } = useEtapasExecucao(id, empresa.id, prod, solicitacao?.valor ?? null, !!solicitacao);

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
              const isPendente = etapa.status === "pendente";
              // Só trava a fila entre etapas que dependem de decisão humana (tipo "papel" e
              // obrigatórias). Etapas automáticas (sistema/ia) ainda não têm rotina própria
              // pra fechar sozinhas, então não fazem sentido travar quem vem depois delas ainda.
              const etapaAnteriorPendente = etapas
                .slice(0, index)
                .some(
                  (anterior) =>
                    anterior.configuracao_fluxo.responsavel_tipo === "papel" &&
                    anterior.configuracao_fluxo.obrigatoria &&
                    anterior.status !== "aprovada",
                );
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
                      {isPendente && etapaAnteriorPendente && " · aguardando etapa anterior"}
                    </p>
                  </div>
                  {isNegociacao && isPendente && (
                    <Link
                      to="/$produto/$empresa/negociacao/$id"
                      params={{ produto, empresa: empresaSlug, id }}
                      className="shrink-0"
                    >
                      <Button size="sm" className="h-8 bg-primary text-primary-foreground">
                        Gerenciar negociação <ArrowUpRight className="size-3.5 ml-1" />
                      </Button>
                    </Link>
                  )}
                  {isElaboracaoContrato && isPendente && (
                    <Link
                      to="/$produto/$empresa/contrato/$id"
                      params={{ produto, empresa: empresaSlug, id }}
                      className="shrink-0"
                    >
                      <Button size="sm" className="h-8 bg-primary text-primary-foreground">
                        Elaborar contrato <ArrowUpRight className="size-3.5 ml-1" />
                      </Button>
                    </Link>
                  )}
                  {isPendente && !isIa && !isSistema && !isNegociacao && !isElaboracaoContrato && !etapaAnteriorPendente && (
                    <BotaoNotificar etapaId={etapa.id} />
                  )}
                  {isPendente && !isIa && !isSistema && !isNegociacao && !isElaboracaoContrato && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-destructive border-destructive/30"
                        disabled={etapaAnteriorPendente}
                        onClick={() => decidir.mutate({ etapaId: etapa.id, status: "rejeitada" })}
                      >
                        Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 bg-primary text-primary-foreground"
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
    </div>
  );
}
