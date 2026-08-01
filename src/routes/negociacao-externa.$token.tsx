import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
import { PainelNegociacao, type Negociacao, type NegociacaoApi } from "@/components/negociacao-painel";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export const Route = createFileRoute("/negociacao-externa/$token")({
  component: NegociacaoExternaPage,
});

const tokenSchema = z.object({ token: z.string() });
const criarSchema = z.object({ token: z.string(), dados: z.record(z.string(), z.any()) });
const atualizarSchema = z.object({ token: z.string(), negociacaoId: z.string(), dados: z.record(z.string(), z.any()) });
const escolherSchema = z.object({ token: z.string(), negociacaoId: z.string(), justificativa: z.string() });

/**
 * Valida o token de trabalho e devolve a etapa e a solicitação ligadas a ele.
 * Todo acesso externo passa por aqui: o link é a credencial.
 */
async function resolverToken(admin: any, token: string) {
  const { data: registro } = await admin
    .from("aprovacao_tokens")
    .select("id, etapa_execucao_id, expira_em, tipo")
    .eq("token", token)
    .eq("tipo", "trabalho")
    .maybeSingle();

  if (!registro) return { erro: "invalido" as const };
  if (new Date(registro.expira_em) < new Date()) return { erro: "expirado" as const };

  const { data: etapa } = await admin
    .from("etapas_execucao")
    .select("id, status, solicitacao_id")
    .eq("id", registro.etapa_execucao_id)
    .single();
  if (!etapa) return { erro: "invalido" as const };

  return { erro: null, etapa };
}

type ContextoNegociacao =
  | { ok: false; erro: "invalido" | "expirado" }
  | {
      ok: true;
      concluida: boolean;
      empresaNome: string;
      solicitacao: {
        numero: number;
        titulo: string;
        descricao: string | null;
        area: string | null;
        centroCusto: string | null;
      };
    };

const carregarContexto = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }): Promise<ContextoNegociacao> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await resolverToken(supabaseAdmin, data.token);
    if (r.erro) return { ok: false, erro: r.erro };

    const { data: solicitacao } = await supabaseAdmin
      .from("solicitacoes")
      .select("numero, titulo, descricao, area, centro_custo, empresa_id")
      .eq("id", r.etapa.solicitacao_id)
      .single();

    const { data: empresa } = await supabaseAdmin
      .from("empresas_clientes")
      .select("nome")
      .eq("id", solicitacao?.empresa_id ?? "")
      .maybeSingle();

    return {
      ok: true,
      concluida: r.etapa.status !== "pendente",
      empresaNome: empresa?.nome ?? "",
      solicitacao: {
        numero: solicitacao?.numero ?? 0,
        titulo: solicitacao?.titulo ?? "",
        descricao: solicitacao?.descricao ?? null,
        area: solicitacao?.area ?? null,
        centroCusto: solicitacao?.centro_custo ?? null,
      },
    };
  });

const listarExterno = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await resolverToken(supabaseAdmin, data.token);
    if (r.erro) throw new Error("Link inválido ou expirado.");

    const { data: lista } = await supabaseAdmin
      .from("negociacoes")
      .select("*")
      .eq("solicitacao_id", r.etapa.solicitacao_id)
      .order("data_cadastro", { ascending: true });

    return (lista ?? []).map((n: any) => ({
      ...n,
      valor_negociado: n.valor_negociado != null ? Number(n.valor_negociado) : null,
    })) as Negociacao[];
  });

const criarExterno = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => criarSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await resolverToken(supabaseAdmin, data.token);
    if (r.erro) throw new Error("Link inválido ou expirado.");
    if (r.etapa.status !== "pendente") throw new Error("Essa negociação já foi concluída.");

    const linha: TablesInsert<"negociacoes"> = {
      solicitacao_id: r.etapa.solicitacao_id,
      ...data.dados,
    } as TablesInsert<"negociacoes">;
    const { error } = await supabaseAdmin.from("negociacoes").insert(linha);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const atualizarExterno = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => atualizarSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await resolverToken(supabaseAdmin, data.token);
    if (r.erro) throw new Error("Link inválido ou expirado.");
    if (r.etapa.status !== "pendente") throw new Error("Essa negociação já foi concluída.");

    // Só deixa mexer em linha que pertence à solicitação daquele token
    const linha = data.dados as TablesUpdate<"negociacoes">;
    const { error } = await supabaseAdmin
      .from("negociacoes")
      .update(linha)
      .eq("id", data.negociacaoId)
      .eq("solicitacao_id", r.etapa.solicitacao_id)
      .eq("status", "participante");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const escolherExterno = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => escolherSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await resolverToken(supabaseAdmin, data.token);
    if (r.erro) throw new Error("Link inválido ou expirado.");
    if (r.etapa.status !== "pendente") throw new Error("Essa negociação já foi concluída.");

    const solicitacaoId = r.etapa.solicitacao_id;

    const { data: escolhida } = await supabaseAdmin
      .from("negociacoes")
      .select("valor_negociado, fornecedor_nome")
      .eq("id", data.negociacaoId)
      .eq("solicitacao_id", solicitacaoId)
      .single();
    if (!escolhida) throw new Error("Empresa não encontrada nesta negociação.");

    await supabaseAdmin
      .from("negociacoes")
      .update({ status: "escolhida", justificativa_escolha: data.justificativa })
      .eq("id", data.negociacaoId)
      .eq("solicitacao_id", solicitacaoId);

    await supabaseAdmin
      .from("negociacoes")
      .update({ status: "descartada" })
      .eq("solicitacao_id", solicitacaoId)
      .eq("status", "participante")
      .neq("id", data.negociacaoId);

    await supabaseAdmin
      .from("solicitacoes")
      .update({ valor: escolhida.valor_negociado, fornecedor_nome: escolhida.fornecedor_nome })
      .eq("id", solicitacaoId);

    await supabaseAdmin
      .from("etapas_execucao")
      .update({ status: "aprovada", decidido_em: new Date().toISOString() })
      .eq("id", r.etapa.id);

    const { avancarFluxo } = await import("@/motor.server");
    await avancarFluxo(supabaseAdmin, solicitacaoId);

    return { ok: true };
  });

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header style={{ background: "var(--primary)" }}>
        <div className="max-w-3xl mx-auto px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            VeschIA AIP
          </p>
          <h1 className="text-[19px] font-semibold text-primary-foreground">Negociação Comercial</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-6">{children}</main>
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

function NegociacaoExternaPage() {
  const { token } = Route.useParams();

  const { data: ctx, isLoading, refetch: recarregarContexto } = useQuery({
    queryKey: ["negociacao-externa-ctx", token],
    queryFn: async () => carregarContexto({ data: { token } }),
  });

  const api: NegociacaoApi = {
    listar: async () => listarExterno({ data: { token } }),
    criar: async (dados) => {
      await criarExterno({ data: { token, dados } });
    },
    atualizar: async (negociacaoId, dados) => {
      await atualizarExterno({ data: { token, negociacaoId, dados } });
    },
    escolher: async (negociacaoId, justificativa) => {
      await escolherExterno({ data: { token, negociacaoId, justificativa } });
      // Depois de escolher, a etapa fecha: recarrega o contexto pra tela virar somente leitura.
      await recarregarContexto();
    },
  };

  if (isLoading) return <Moldura><p className="text-sm text-muted-foreground">Carregando…</p></Moldura>;

  if (!ctx || !ctx.ok) {
    if (!ctx || ctx.erro === "invalido") {
      return <Moldura><Aviso titulo="Link inválido" texto="Esse link de negociação não existe ou foi removido." /></Moldura>;
    }
    return <Moldura><Aviso titulo="Link expirado" texto="Esse link passou do prazo de validade. Peça um novo aviso pelo sistema." /></Moldura>;
  }

  const s = ctx.solicitacao;

  return (
    <Moldura>
      <div className="rounded-xl border border-border bg-card p-4 mb-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{ctx.empresaNome}</p>
        <h2 className="text-lg font-semibold mt-1">
          #{s.numero} · {s.titulo}
        </h2>
        {(s.area || s.centroCusto) && (
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {s.area}
            {s.centroCusto ? ` · ${s.centroCusto}` : ""}
          </p>
        )}
        {s.descricao && <p className="text-sm mt-2">{s.descricao}</p>}
      </div>

      <PainelNegociacao api={api} queryKey={["negociacao-externa", token]} somenteLeitura={ctx.concluida} />
    </Moldura>
  );
}
