import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { RefreshCw, Ban, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/renovacao/$token")({
  component: RenovacaoPage,
});

const tokenSchema = z.object({ token: z.string() });
const decisaoSchema = z.object({ token: z.string(), acao: z.enum(["renovar", "encerrar"]) });

const NOME_ETAPA = "Renovação ou Encerramento";

function somarDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Mesma regra usada na negociação: em vigência > 30 dias, o "término" fica 30
 * dias antes do fim real, pra sobrar prazo de decidir renovação. */
function calcularDataTermino(dataInicioISO: string, vigenciaDias: number): string {
  const diasEfetivos = vigenciaDias > 30 ? vigenciaDias - 30 : vigenciaDias;
  return somarDias(dataInicioISO, diasEfetivos);
}

/** Carrega os dados da decisão a partir do token, sem exigir login. */
const carregarRenovacao = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: registro } = await supabaseAdmin
      .from("aprovacao_tokens")
      .select("id, etapa_execucao_id, expira_em, usado_em, decisao")
      .eq("token", data.token)
      .eq("tipo", "decisao")
      .maybeSingle();

    if (!registro) return { estado: "invalido" as const };
    if (registro.usado_em) return { estado: "usado" as const };
    if (new Date(registro.expira_em) < new Date()) return { estado: "expirado" as const };

    const { data: etapa } = await supabaseAdmin
      .from("etapas_execucao")
      .select("id, status, solicitacao_id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa)")
      .eq("id", registro.etapa_execucao_id)
      .single();

    if (!etapa || (etapa as any).configuracao_fluxo?.nome_etapa !== NOME_ETAPA) {
      return { estado: "invalido" as const };
    }
    if (etapa.status !== "pendente") return { estado: "ja_decidida" as const };

    const { data: solicitacao } = await supabaseAdmin
      .from("solicitacoes")
      .select("numero, titulo, empresa_id")
      .eq("id", etapa.solicitacao_id)
      .single();

    const { data: empresa } = await supabaseAdmin
      .from("empresas_clientes")
      .select("nome")
      .eq("id", solicitacao?.empresa_id ?? "")
      .maybeSingle();

    const { data: contrato } = await supabaseAdmin
      .from("contratos")
      .select("numero, titulo, fornecedor_nome, valor, data_inicio, data_termino, vigencia_dias, status")
      .eq("solicitacao_id", etapa.solicitacao_id)
      .maybeSingle();

    if (!contrato) return { estado: "invalido" as const };

    return {
      estado: "valido" as const,
      empresaNome: empresa?.nome ?? "",
      solicitacao: { numero: solicitacao?.numero ?? 0, titulo: solicitacao?.titulo ?? "" },
      contrato: {
        numero: contrato.numero,
        fornecedor: contrato.fornecedor_nome,
        valor: contrato.valor != null ? Number(contrato.valor) : null,
        dataInicio: contrato.data_inicio,
        dataTermino: contrato.data_termino,
        vigenciaDias: contrato.vigencia_dias,
      },
    };
  });

/**
 * Registra a decisão. Encerrar fecha o ciclo (o motor cuida do resto, igual já
 * fazia). Renovar reabre o próximo ciclo com as mesmas condições: soma a vigência
 * de novo a partir do fim real do contrato atual, e reabre Execução, Monitoramento
 * e esta própria etapa pra que a rotina diária volte a acompanhar o novo prazo.
 * (Ajustar as condições na renovação, via Termo Aditivo, fica pra quando o TAC
 * existir — por ora, a renovação repete os mesmos termos.)
 */
const registrarDecisaoRenovacao = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => decisaoSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { avancarFluxo } = await import("@/motor.server");

    const { data: registro } = await supabaseAdmin
      .from("aprovacao_tokens")
      .select("id, etapa_execucao_id, expira_em, usado_em")
      .eq("token", data.token)
      .eq("tipo", "decisao")
      .maybeSingle();

    if (!registro) throw new Error("Link inválido.");
    if (registro.usado_em) throw new Error("Esse link já foi usado.");
    if (new Date(registro.expira_em) < new Date()) throw new Error("Esse link expirou.");

    const { data: etapa } = await supabaseAdmin
      .from("etapas_execucao")
      .select("id, status, solicitacao_id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa)")
      .eq("id", registro.etapa_execucao_id)
      .single();

    if (!etapa || (etapa as any).configuracao_fluxo?.nome_etapa !== NOME_ETAPA) {
      throw new Error("Link inválido.");
    }
    if (etapa.status !== "pendente") throw new Error("Essa decisão já foi tomada.");

    const solicitacaoId = etapa.solicitacao_id;

    if (data.acao === "encerrar") {
      const { data: contrato } = await supabaseAdmin
        .from("contratos")
        .select("id")
        .eq("solicitacao_id", solicitacaoId)
        .maybeSingle();
      if (contrato) {
        await supabaseAdmin.from("contratos").update({ status: "encerrado" }).eq("id", contrato.id);
      }

      await supabaseAdmin
        .from("etapas_execucao")
        .update({ status: "aprovada", decidido_em: new Date().toISOString() })
        .eq("id", etapa.id)
        .eq("status", "pendente");
    } else {
      const { data: contrato } = await supabaseAdmin
        .from("contratos")
        .select("id, data_inicio, vigencia_dias")
        .eq("solicitacao_id", solicitacaoId)
        .maybeSingle();
      if (!contrato || !contrato.data_inicio || !contrato.vigencia_dias) {
        throw new Error("Contrato sem data de início ou vigência cadastrada; não é possível renovar automaticamente.");
      }

      // Fim real do ciclo atual (data_termino guardada é só o gatilho de aviso,
      // 30 dias antes, não o fim de fato).
      const fimRealAtual = somarDias(contrato.data_inicio, contrato.vigencia_dias);
      const novaDataInicio = somarDias(fimRealAtual, 1);
      const novaDataTermino = calcularDataTermino(novaDataInicio, contrato.vigencia_dias);

      await supabaseAdmin
        .from("contratos")
        .update({
          data_inicio: novaDataInicio,
          data_termino: novaDataTermino,
          status: "ativo",
          renovacao_ativada_em: null,
          alerta_previo_enviado_em: null,
        })
        .eq("id", contrato.id);

      // Reabre Execução, Monitoramento e esta etapa, pra reiniciar o acompanhamento
      // do novo ciclo.
      const { data: etapasAcompanhamento } = await supabaseAdmin
        .from("etapas_execucao")
        .select("id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa)")
        .eq("solicitacao_id", solicitacaoId);

      for (const e of (etapasAcompanhamento ?? []) as any[]) {
        const nome = e.configuracao_fluxo?.nome_etapa;
        if (nome === "Execução" || nome === "Monitoramento") {
          await supabaseAdmin
            .from("etapas_execucao")
            .update({ status: "pendente", decidido_em: null })
            .eq("id", e.id);
        }
      }

      await supabaseAdmin
        .from("etapas_execucao")
        .update({ status: "pendente", decidido_em: null, comentario: null })
        .eq("id", etapa.id);

      // Limpa os tokens antigos dessa etapa: senão o motor acha que "já avisou"
      // e não manda um novo e-mail quando o próximo ciclo terminar.
      await supabaseAdmin.from("aprovacao_tokens").delete().eq("etapa_execucao_id", etapa.id);
    }

    // Este token específico não pode ser reaproveitado, decidido ou não.
    await supabaseAdmin
      .from("aprovacao_tokens")
      .update({ usado_em: new Date().toISOString(), decisao: data.acao === "encerrar" ? "aprovada" : "rejeitada" })
      .eq("id", registro.id);

    await avancarFluxo(supabaseAdmin, solicitacaoId);

    return { ok: true, acao: data.acao };
  });

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header style={{ background: "var(--primary)" }}>
        <div className="max-w-2xl mx-auto px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            VeschIA AIP
          </p>
          <h1 className="text-[19px] font-semibold text-primary-foreground">Renovação ou Encerramento</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-6">{children}</main>
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-center">
      <AlertCircle className="size-6 mx-auto text-muted-foreground mb-2" />
      <p className="font-medium">{titulo}</p>
      <p className="text-sm text-muted-foreground mt-1">{texto}</p>
    </div>
  );
}

function formatarData(dataISO: string | null): string {
  if (!dataISO) return "não informada";
  return new Date(dataISO + "T00:00:00").toLocaleDateString("pt-BR");
}

function RenovacaoPage() {
  const { token } = Route.useParams();
  const [resultado, setResultado] = React.useState<"renovar" | "encerrar" | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["renovacao", token],
    queryFn: async () => carregarRenovacao({ data: { token } }),
  });

  const decidirMut = useMutation({
    mutationFn: async (acao: "renovar" | "encerrar") => registrarDecisaoRenovacao({ data: { token, acao } }),
    onSuccess: (res) => setResultado(res.acao),
    onError: (e: Error) => setErro(e.message),
  });

  if (isLoading) {
    return <Moldura><p className="text-sm text-muted-foreground">Carregando…</p></Moldura>;
  }

  if (resultado) {
    return (
      <Moldura>
        <div className="rounded-xl border border-border bg-card p-5 text-center">
          <div
            className="size-10 rounded-full grid place-items-center mx-auto mb-3"
            style={{ background: resultado === "renovar" ? "var(--ops-aprovada)" : "var(--ops-rejeitada)" }}
          >
            {resultado === "renovar" ? (
              <RefreshCw className="size-5 text-white" />
            ) : (
              <Ban className="size-5 text-white" />
            )}
          </div>
          <p className="font-medium">{resultado === "renovar" ? "Contrato renovado" : "Contrato encerrado"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {resultado === "renovar"
              ? "O ciclo foi reaberto com as mesmas condições. Pode fechar esta página."
              : "O contrato foi encerrado. Pode fechar esta página."}
          </p>
        </div>
      </Moldura>
    );
  }

  if (!data || data.estado === "invalido") {
    return <Moldura><Aviso titulo="Link inválido" texto="Esse link não existe ou foi removido." /></Moldura>;
  }
  if (data.estado === "expirado") {
    return <Moldura><Aviso titulo="Link expirado" texto="Esse link passou do prazo de validade. Peça um novo aviso pelo sistema." /></Moldura>;
  }
  if (data.estado === "usado") {
    return <Moldura><Aviso titulo="Link já utilizado" texto="Essa decisão já foi registrada." /></Moldura>;
  }
  if (data.estado === "ja_decidida") {
    return <Moldura><Aviso titulo="Etapa já decidida" texto="Essa etapa já foi resolvida dentro do sistema." /></Moldura>;
  }

  const c = data.contrato;

  return (
    <Moldura>
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{data.empresaNome}</p>
          <h2 className="text-lg font-semibold mt-1">
            Contrato #{c.numero} · {data.solicitacao.titulo}
          </h2>
        </div>

        <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5">
          {c.fornecedor && (
            <>
              <dt className="text-muted-foreground">Fornecedor</dt>
              <dd>{c.fornecedor}</dd>
            </>
          )}
          {c.valor != null && (
            <>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="font-semibold" style={{ color: "var(--accent)" }}>
                {c.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Vigência</dt>
          <dd>{c.vigenciaDias ? `${c.vigenciaDias} dias` : "não informada"}</dd>
          <dt className="text-muted-foreground">Início</dt>
          <dd>{formatarData(c.dataInicio)}</dd>
        </dl>

        <p className="text-sm">
          Este contrato chegou ao fim da vigência. Escolha um dos caminhos abaixo:
        </p>
        <ul className="text-[13px] text-muted-foreground list-disc pl-4 space-y-0.5">
          <li>
            <strong className="text-foreground">Renovar</strong>: reabre um novo ciclo com as mesmas condições
            (mesmo valor, mesma vigência).
          </li>
          <li>
            <strong className="text-foreground">Encerrar</strong>: fecha o contrato definitivamente.
          </li>
        </ul>

        {erro && <p className="text-[13px] text-destructive">{erro}</p>}

        <div className="flex gap-2 pt-1">
          <Button
            variant="recusarOutline"
            className="flex-1"
            disabled={decidirMut.isPending}
            onClick={() => decidirMut.mutate("encerrar")}
          >
            <Ban className="size-4 mr-1.5" /> Encerrar
          </Button>
          <Button
            className="flex-1" variant="confirmar"
            disabled={decidirMut.isPending}
            onClick={() => decidirMut.mutate("renovar")}
          >
            <RefreshCw className="size-4 mr-1.5" /> Renovar
          </Button>
        </div>
        <p className="text-[11.5px] text-muted-foreground text-center">
          Confirme acima para registrar sua decisão. Este link vale uma vez só.
        </p>
      </div>
    </Moldura>
  );
}
