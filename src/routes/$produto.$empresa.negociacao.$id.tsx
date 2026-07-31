import { Link, createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useEmpresa } from "@/lib/empresa";
import { ChevronLeft } from "lucide-react";
import { PainelNegociacao, type Negociacao, type NegociacaoApi } from "@/components/negociacao-painel";

export const Route = createFileRoute("/$produto/$empresa/negociacao/$id")({
  component: NegociacaoPage,
});

const motorSchema = z.object({ solicitacaoId: z.string() });

/** Chama o motor pra empurrar o fluxo depois que a negociação fecha. */
const rodarMotor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => motorSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { avancarFluxo } = await import("@/motor.server");
    return avancarFluxo(supabaseAdmin, data.solicitacaoId);
  });

function NegociacaoPage() {
  const { produto, empresa: empresaSlug, id } = Route.useParams();
  useEmpresa();

  const api: NegociacaoApi = {
    listar: async () => {
      const { data, error } = await supabase
        .from("negociacoes")
        .select("*")
        .eq("solicitacao_id", id)
        .order("data_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((n) => ({
        ...n,
        valor_negociado: n.valor_negociado != null ? Number(n.valor_negociado) : null,
      })) as Negociacao[];
    },
    criar: async (dados) => {
      const { error } = await supabase.from("negociacoes").insert({ solicitacao_id: id, ...dados });
      if (error) throw error;
    },
    atualizar: async (negociacaoId, dados) => {
      const { error } = await supabase.from("negociacoes").update(dados).eq("id", negociacaoId);
      if (error) throw error;
    },
    escolher: async (negociacaoId, justificativa) => {
      const { data: escolhida, error: e0 } = await supabase
        .from("negociacoes")
        .select("valor_negociado, fornecedor_nome")
        .eq("id", negociacaoId)
        .single();
      if (e0) throw e0;

      const { error: e1 } = await supabase
        .from("negociacoes")
        .update({ status: "escolhida", justificativa_escolha: justificativa })
        .eq("id", negociacaoId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("negociacoes")
        .update({ status: "descartada" })
        .eq("solicitacao_id", id)
        .eq("status", "participante")
        .neq("id", negociacaoId);
      if (e2) throw e2;

      const { error: e3 } = await supabase
        .from("solicitacoes")
        .update({ valor: escolhida.valor_negociado, fornecedor_nome: escolhida.fornecedor_nome })
        .eq("id", id);
      if (e3) throw e3;

      const { data: etapas, error: e4 } = await supabase
        .from("etapas_execucao")
        .select("id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa)")
        .eq("solicitacao_id", id);
      if (e4) throw e4;

      const etapa = (etapas ?? []).find((e: any) => e.configuracao_fluxo?.nome_etapa === "Negociação Comercial");
      if (etapa) {
        await supabase
          .from("etapas_execucao")
          .update({ status: "aprovada", decidido_em: new Date().toISOString() })
          .eq("id", (etapa as any).id);
      }

      // Com a negociação fechada, o motor segue sozinho: gera a minuta e avisa quem aprova.
      await rodarMotor({ data: { solicitacaoId: id } });
    },
  };

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header style={{ background: "var(--primary)" }}>
        <div className="max-w-3xl mx-auto px-5 py-3.5">
          <Link
            to="/$produto/$empresa/solicitacoes/$id"
            params={{ produto, empresa: empresaSlug, id }}
            className="text-[13px] flex items-center gap-1 text-primary-foreground/70 hover:text-primary-foreground w-fit"
          >
            <ChevronLeft className="size-3.5" /> Voltar pra solicitação
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Negociação Comercial</h1>
        <PainelNegociacao api={api} queryKey={["negociacoes", id]} />
      </main>
    </div>
  );
}
