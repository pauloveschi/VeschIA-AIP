import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, MessageSquareWarning, FileText, AlertCircle, Download } from "lucide-react";

export const Route = createFileRoute("/juridico/$token")({
  component: JuridicoPage,
});

const tokenSchema = z.object({ token: z.string() });
const decisaoSchema = z.object({
  token: z.string(),
  acao: z.enum(["aprovar", "rejeitar"]),
  ressalva: z.string().optional(),
});

const NOME_ETAPA = "Validação Jurídica";

/** Carrega os dados da validação a partir do token, sem exigir login. */
const carregarValidacaoJuridica = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: registro } = await supabaseAdmin
      .from("aprovacao_tokens")
      .select("id, etapa_execucao_id, expira_em, usado_em")
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
      .select("numero, titulo, fornecedor_nome, valor, empresa_id")
      .eq("id", etapa.solicitacao_id)
      .single();

    const { data: empresa } = await supabaseAdmin
      .from("empresas_clientes")
      .select("nome")
      .eq("id", solicitacao?.empresa_id ?? "")
      .maybeSingle();

    const { data: doc } = await supabaseAdmin
      .from("documentos")
      .select("nome_arquivo, url")
      .eq("solicitacao_id", etapa.solicitacao_id)
      .eq("tipo", "minuta_contrato")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let urlContrato: string | null = null;
    if (doc?.url) {
      const { data: signed } = await supabaseAdmin.storage.from("documentos").createSignedUrl(doc.url, 60 * 60);
      urlContrato = signed?.signedUrl ?? null;
    }

    return {
      estado: "valido" as const,
      empresaNome: empresa?.nome ?? "",
      solicitacao: {
        numero: solicitacao?.numero ?? 0,
        titulo: solicitacao?.titulo ?? "",
        fornecedor: solicitacao?.fornecedor_nome ?? null,
        valor: solicitacao?.valor != null ? Number(solicitacao.valor) : null,
      },
      contrato: doc ? { nome: doc.nome_arquivo, url: urlContrato } : null,
    };
  });

/**
 * Registra a decisão do Jurídico. Aprovar segue o fluxo normal. Pedir ajuste
 * centraliza qualquer correção (cláusula, valor, prazo, objeto) de volta na
 * Elaboração do Contrato — nunca na Negociação — pra IA regerar a minuta com a
 * ressalva, e volta pra Validação Jurídica de novo. Sem limite de tentativas.
 */
const registrarDecisaoJuridica = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => decisaoSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.acao === "rejeitar" && (!data.ressalva || data.ressalva.trim().length < 5)) {
      throw new Error("Descreva o que precisa ser ajustado no contrato.");
    }

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
    if (etapa.status !== "pendente") throw new Error("Essa etapa já foi decidida.");

    const solicitacaoId = etapa.solicitacao_id;

    if (data.acao === "aprovar") {
      await supabaseAdmin
        .from("etapas_execucao")
        .update({ status: "aprovada", decidido_em: new Date().toISOString() })
        .eq("id", etapa.id)
        .eq("status", "pendente");
    } else {
      const ressalva = data.ressalva!.trim();

      const { data: etapaElaboracao } = await supabaseAdmin
        .from("etapas_execucao")
        .select("id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa)")
        .eq("solicitacao_id", solicitacaoId);

      const elaboracao = ((etapaElaboracao ?? []) as any[]).find(
        (e) => e.configuracao_fluxo?.nome_etapa === "Elaboração do Contrato",
      );
      if (!elaboracao) throw new Error("Etapa de Elaboração do Contrato não encontrada nessa solicitação.");

      await supabaseAdmin.from("solicitacoes").update({ ressalva_juridica: ressalva }).eq("id", solicitacaoId);

      // Reabre a Elaboração do Contrato (a IA regera a minuta com a ressalva) e
      // esta própria etapa (pra validar de novo assim que a minuta nova sair).
      await supabaseAdmin
        .from("etapas_execucao")
        .update({ status: "pendente", decidido_em: null })
        .eq("id", elaboracao.id);

      await supabaseAdmin
        .from("etapas_execucao")
        .update({ status: "pendente", decidido_em: null, comentario: ressalva })
        .eq("id", etapa.id);

      // Limpa os tokens antigos dessa etapa: senão o motor acha que "já avisou"
      // e não manda o e-mail da próxima rodada quando a minuta nova sair.
      await supabaseAdmin.from("aprovacao_tokens").delete().eq("etapa_execucao_id", etapa.id);
    }

    await supabaseAdmin
      .from("aprovacao_tokens")
      .update({
        usado_em: new Date().toISOString(),
        decisao: data.acao === "aprovar" ? "aprovada" : "rejeitada",
      })
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
          <h1 className="text-[19px] font-semibold text-primary-foreground">Validação Jurídica</h1>
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

function JuridicoPage() {
  const { token } = Route.useParams();
  const [modoRessalva, setModoRessalva] = React.useState(false);
  const [ressalva, setRessalva] = React.useState("");
  const [resultado, setResultado] = React.useState<"aprovar" | "rejeitar" | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["juridico", token],
    queryFn: async () => carregarValidacaoJuridica({ data: { token } }),
  });

  const decidirMut = useMutation({
    mutationFn: async (vars: { acao: "aprovar" | "rejeitar"; ressalva?: string }) =>
      registrarDecisaoJuridica({ data: { token, ...vars } }),
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
            style={{ background: resultado === "aprovar" ? "var(--ops-aprovada)" : "var(--ops-rejeitada)" }}
          >
            {resultado === "aprovar" ? (
              <Check className="size-5 text-white" />
            ) : (
              <MessageSquareWarning className="size-5 text-white" />
            )}
          </div>
          <p className="font-medium">
            {resultado === "aprovar" ? "Minuta aprovada" : "Ajuste solicitado"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {resultado === "aprovar"
              ? "O contrato segue pra Aprovação Interna. Pode fechar esta página."
              : "A IA vai gerar uma nova minuta com o ajuste pedido, e ela volta pra você validar. Pode fechar esta página."}
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

  const s = data.solicitacao;

  return (
    <Moldura>
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{data.empresaNome}</p>
          <h2 className="text-lg font-semibold mt-1">
            #{s.numero} · {s.titulo}
          </h2>
        </div>

        <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5">
          {s.fornecedor && (
            <>
              <dt className="text-muted-foreground">Fornecedor</dt>
              <dd>{s.fornecedor}</dd>
            </>
          )}
          {s.valor != null && (
            <>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="font-semibold" style={{ color: "var(--accent)" }}>
                {s.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </dd>
            </>
          )}
        </dl>

        {data.contrato?.url && (
          <a
            href={data.contrato.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 hover:border-ring"
          >
            <span className="flex items-center gap-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              {data.contrato.nome}
            </span>
            <Download className="size-4 text-muted-foreground" />
          </a>
        )}

        {erro && <p className="text-[13px] text-destructive">{erro}</p>}

        {!modoRessalva ? (
          <>
            <div className="flex gap-2 pt-1">
              <Button
                variant="recusarOutline"
                className="flex-1"
                disabled={decidirMut.isPending}
                onClick={() => setModoRessalva(true)}
              >
                <MessageSquareWarning className="size-4 mr-1.5" /> Pedir ajuste
              </Button>
              <Button
                className="flex-1" variant="confirmar"
                disabled={decidirMut.isPending}
                onClick={() => decidirMut.mutate({ acao: "aprovar" })}
              >
                <Check className="size-4 mr-1.5" /> Aprovar
              </Button>
            </div>
            <p className="text-[11.5px] text-muted-foreground text-center">
              Confirme acima para registrar sua decisão. Este link vale uma vez só.
            </p>
          </>
        ) : (
          <div className="space-y-2 pt-1">
            <label className="text-[12.5px] font-medium">
              O que precisa ser ajustado na minuta? (cláusula, valor, prazo, objeto…)
            </label>
            <Textarea
              value={ressalva}
              onChange={(e) => setRessalva(e.target.value)}
              placeholder="Ex.: incluir cláusula de confidencialidade; ajustar multa de rescisão para..."
              rows={4}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={decidirMut.isPending}
                onClick={() => {
                  setModoRessalva(false);
                  setRessalva("");
                  setErro(null);
                }}
              >
                Voltar
              </Button>
              <Button
                className="flex-1" variant="recusar"
                disabled={decidirMut.isPending || ressalva.trim().length < 5}
                onClick={() => decidirMut.mutate({ acao: "rejeitar", ressalva })}
              >
                Enviar ajuste
              </Button>
            </div>
          </div>
        )}
      </div>
    </Moldura>
  );
}
