import * as React from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Check, X, FileText, AlertCircle, Download } from "lucide-react";

const searchSchema = z.object({
  acao: z.enum(["aprovar", "rejeitar"]).optional(),
});

export const Route = createFileRoute("/aprovacao/$token")({
  component: AprovacaoPage,
  validateSearch: searchSchema,
});

const tokenSchema = z.object({ token: z.string() });
const decisaoSchema = z.object({ token: z.string(), decisao: z.enum(["aprovada", "rejeitada"]) });

/** Carrega os dados da aprovação a partir do token, sem exigir login. */
const carregarAprovacao = createServerFn({ method: "POST" })
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
    if (registro.usado_em) {
      return { estado: "usado" as const, decisao: registro.decisao };
    }
    if (new Date(registro.expira_em) < new Date()) return { estado: "expirado" as const };

    const { data: etapa } = await supabaseAdmin
      .from("etapas_execucao")
      .select(
        "id, status, solicitacao_id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa), papel_resolvido:papel_resolvido_id(nome)",
      )
      .eq("id", registro.etapa_execucao_id)
      .single();

    if (!etapa) return { estado: "invalido" as const };
    if (etapa.status !== "pendente") return { estado: "ja_decidida" as const, statusAtual: etapa.status };

    const { data: solicitacao } = await supabaseAdmin
      .from("solicitacoes")
      .select("numero, titulo, descricao, area, centro_custo, fornecedor_nome, valor, empresa_id")
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

    // Traz o resultado da negociação: quem foi escolhido, por quê, e quem mais concorreu.
    // Sem isso o aprovador decide sem enxergar a comparação que sustentou a escolha.
    const { data: negociacoes } = await supabaseAdmin
      .from("negociacoes")
      .select("fornecedor_nome, valor_negociado, status, justificativa_escolha")
      .eq("solicitacao_id", etapa.solicitacao_id)
      .order("data_cadastro", { ascending: true });

    const escolhida = (negociacoes ?? []).find((n: any) => n.status === "escolhida");
    const descartadas = (negociacoes ?? [])
      .filter((n: any) => n.status === "descartada")
      .map((n: any) => ({
        nome: n.fornecedor_nome,
        valor: n.valor_negociado != null ? Number(n.valor_negociado) : null,
      }));

    return {
      estado: "valido" as const,
      etapaNome: (etapa as any).configuracao_fluxo?.nome_etapa ?? "Aprovação",
      papelNome: (etapa as any).papel_resolvido?.nome ?? null,
      empresaNome: empresa?.nome ?? "",
      solicitacao: {
        numero: solicitacao?.numero ?? 0,
        titulo: solicitacao?.titulo ?? "",
        descricao: solicitacao?.descricao ?? null,
        area: solicitacao?.area ?? null,
        centroCusto: solicitacao?.centro_custo ?? null,
        fornecedor: solicitacao?.fornecedor_nome ?? null,
        valor: solicitacao?.valor != null ? Number(solicitacao.valor) : null,
      },
      contrato: doc ? { nome: doc.nome_arquivo, url: urlContrato } : null,
      negociacao: escolhida
        ? { justificativa: escolhida.justificativa_escolha ?? null, descartadas }
        : null,
    };
  });

/** Registra a decisão e queima o token, pra o mesmo link não valer duas vezes. */
const registrarDecisao = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => decisaoSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: registro } = await supabaseAdmin
      .from("aprovacao_tokens")
      .select("id, etapa_execucao_id, expira_em, usado_em")
      .eq("token", data.token)
      .eq("tipo", "decisao")
      .maybeSingle();

    if (!registro) throw new Error("Link inválido.");
    if (registro.usado_em) throw new Error("Esse link já foi usado.");
    if (new Date(registro.expira_em) < new Date()) throw new Error("Esse link expirou.");

    const { error: eEtapa } = await supabaseAdmin
      .from("etapas_execucao")
      .update({ status: data.decisao, decidido_em: new Date().toISOString() })
      .eq("id", registro.etapa_execucao_id)
      .eq("status", "pendente");
    if (eEtapa) throw new Error("Não foi possível registrar a decisão.");

    await supabaseAdmin
      .from("aprovacao_tokens")
      .update({ usado_em: new Date().toISOString(), decisao: data.decisao })
      .eq("id", registro.id);

    // Decisão tomada de fora do sistema: o motor continua o fluxo na sequência.
    const { data: etapaDecidida } = await supabaseAdmin
      .from("etapas_execucao")
      .select("solicitacao_id")
      .eq("id", registro.etapa_execucao_id)
      .single();
    if (etapaDecidida?.solicitacao_id) {
      const { avancarFluxo } = await import("@/motor.server");
      await avancarFluxo(supabaseAdmin, etapaDecidida.solicitacao_id);
    }

    return { ok: true, decisao: data.decisao };
  });

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header style={{ background: "var(--primary)" }}>
        <div className="max-w-2xl mx-auto px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            VeschIA AIP
          </p>
          <h1 className="text-[19px] font-semibold text-primary-foreground">Aprovação de solicitação</h1>
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

function AprovacaoPage() {
  const { token } = Route.useParams();
  const { acao } = useSearch({ from: "/aprovacao/$token" });
  const [resultado, setResultado] = React.useState<"aprovada" | "rejeitada" | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["aprovacao", token],
    queryFn: async () => carregarAprovacao({ data: { token } }),
  });

  const decidirMut = useMutation({
    mutationFn: async (decisao: "aprovada" | "rejeitada") => registrarDecisao({ data: { token, decisao } }),
    onSuccess: (res) => setResultado(res.decisao),
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
            style={{ background: resultado === "aprovada" ? "var(--ops-aprovada)" : "var(--ops-rejeitada)" }}
          >
            {resultado === "aprovada" ? <Check className="size-5 text-white" /> : <X className="size-5 text-white" />}
          </div>
          <p className="font-medium">{resultado === "aprovada" ? "Solicitação aprovada" : "Solicitação rejeitada"}</p>
          <p className="text-sm text-muted-foreground mt-1">Sua decisão foi registrada. Pode fechar esta página.</p>
        </div>
      </Moldura>
    );
  }

  if (!data || data.estado === "invalido") {
    return <Moldura><Aviso titulo="Link inválido" texto="Esse link de aprovação não existe ou foi removido." /></Moldura>;
  }
  if (data.estado === "expirado") {
    return <Moldura><Aviso titulo="Link expirado" texto="Esse link passou do prazo de validade. Peça um novo aviso pelo sistema." /></Moldura>;
  }
  if (data.estado === "usado") {
    return (
      <Moldura>
        <Aviso
          titulo="Link já utilizado"
          texto={`Essa aprovação já foi registrada como ${data.decisao === "aprovada" ? "aprovada" : "rejeitada"}.`}
        />
      </Moldura>
    );
  }
  if (data.estado === "ja_decidida") {
    return <Moldura><Aviso titulo="Etapa já decidida" texto="Essa etapa já foi resolvida dentro do sistema." /></Moldura>;
  }

  const s = data.solicitacao;
  const acaoDestacada = acao === "rejeitar" ? "rejeitar" : "aprovar";

  return (
    <Moldura>
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {data.empresaNome} · {data.etapaNome}
            {data.papelNome ? ` · ${data.papelNome}` : ""}
          </p>
          <h2 className="text-lg font-semibold mt-1">
            #{s.numero} · {s.titulo}
          </h2>
        </div>

        {s.descricao && <p className="text-sm">{s.descricao}</p>}

        <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5">
          {s.area && (
            <>
              <dt className="text-muted-foreground">Área</dt>
              <dd>{s.area}</dd>
            </>
          )}
          {s.centroCusto && (
            <>
              <dt className="text-muted-foreground">Centro de custo</dt>
              <dd>{s.centroCusto}</dd>
            </>
          )}
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

        {data.negociacao && (data.negociacao.justificativa || data.negociacao.descartadas.length > 0) && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Resultado da negociação</p>
            {data.negociacao.justificativa && (
              <p className="text-[13px]">
                <span className="text-muted-foreground">Justificativa da escolha: </span>
                {data.negociacao.justificativa}
              </p>
            )}
            {data.negociacao.descartadas.length > 0 && (
              <div className="text-[12.5px]">
                <p className="text-muted-foreground mb-0.5">Também concorreram:</p>
                <ul className="space-y-0.5">
                  {data.negociacao.descartadas.map((d, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{d.nome}</span>
                      <span className="text-muted-foreground">
                        {d.valor != null ? d.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "sem valor"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

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

        <div className="flex gap-2 pt-1">
          <Button
            variant={acaoDestacada === "rejeitar" ? "default" : "outline"}
            className={acaoDestacada === "rejeitar" ? "flex-1 bg-destructive text-white" : "flex-1 text-destructive border-destructive/30"}
            disabled={decidirMut.isPending}
            onClick={() => decidirMut.mutate("rejeitada")}
          >
            <X className="size-4 mr-1.5" /> Rejeitar
          </Button>
          <Button
            variant={acaoDestacada === "aprovar" ? "default" : "outline"}
            className={acaoDestacada === "aprovar" ? "flex-1 bg-primary text-primary-foreground" : "flex-1"}
            disabled={decidirMut.isPending}
            onClick={() => decidirMut.mutate("aprovada")}
          >
            <Check className="size-4 mr-1.5" /> Aprovar
          </Button>
        </div>
        <p className="text-[11.5px] text-muted-foreground text-center">
          Confirme acima para registrar sua decisão. Este link vale uma vez só.
        </p>
      </div>
    </Moldura>
  );
}
