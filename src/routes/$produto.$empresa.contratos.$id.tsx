import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa, useProdutoAtual } from "@/lib/empresa";
import { cn } from "@/lib/utils";
import { Check, FileText } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/contratos/$id")({
  component: ContratoDetailPage,
});

interface FaseConfig {
  id: string;
  ordem: number;
  nome_fase: string;
}

interface Contrato {
  id: string;
  numero: number;
  titulo: string;
  fornecedor_nome: string | null;
  valor: number | null;
  fase_atual_id: string | null;
  status: string;
}

interface SolicitacaoVinculada {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  fase_id: string | null;
}

function useFases(empresaId: string, produto: string) {
  return useQuery({
    queryKey: ["fases-config", empresaId, produto],
    queryFn: async (): Promise<FaseConfig[]> => {
      const { data, error } = await supabase
        .from("fases_config")
        .select("id, ordem, nome_fase")
        .eq("empresa_id", empresaId)
        .eq("produto", produto)
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useContrato(id: string) {
  return useQuery({
    queryKey: ["contrato-detail", id],
    queryFn: async (): Promise<Contrato> => {
      const { data, error } = await supabase.from("contratos").select("*").eq("id", id).single();
      if (error) throw error;
      return { ...data, valor: data.valor != null ? Number(data.valor) : null };
    },
  });
}

function useSolicitacoesDoContrato(contratoId: string) {
  return useQuery({
    queryKey: ["solicitacoes-contrato", contratoId],
    queryFn: async (): Promise<SolicitacaoVinculada[]> => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select("id, numero, titulo, status, fase_id")
        .eq("contrato_id", contratoId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function ContratoDetailPage() {
  const { produto, empresa: empresaSlug, id } = Route.useParams();
  const empresa = useEmpresa();
  const prod = useProdutoAtual();
  const { data: fases = [] } = useFases(empresa.id, prod);
  const { data: contrato, isLoading } = useContrato(id);
  const { data: solicitacoes = [] } = useSolicitacoesDoContrato(id);
  const qc = useQueryClient();

  const avancarFaseMut = useMutation({
    mutationFn: async (novaFaseId: string) => {
      const { error } = await supabase.from("contratos").update({ fase_atual_id: novaFaseId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contrato-detail", id] }),
  });

  if (isLoading || !contrato) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  const faseAtualOrdem = fases.find((f) => f.id === contrato.fase_atual_id)?.ordem ?? 0;

  return (
    <main className="max-w-3xl mx-auto px-5 py-6">
        <p className="text-[12px] text-muted-foreground">Contrato #{contrato.numero}</p>
        <h1 className="text-xl font-semibold mt-1">{contrato.titulo}</h1>
        {contrato.fornecedor_nome && <p className="text-sm text-muted-foreground mt-0.5">{contrato.fornecedor_nome}</p>}
        {contrato.valor != null && (
          <p className="text-lg font-semibold mt-2" style={{ color: "var(--accent)" }}>
            {contrato.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        )}

        {fases.length > 0 && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center">
              {fases.map((fase, i) => {
                const isDone = fase.ordem < faseAtualOrdem;
                const isCurrent = fase.id === contrato.fase_atual_id;
                return (
                  <React.Fragment key={fase.id}>
                    <button
                      onClick={() => !isCurrent && avancarFaseMut.mutate(fase.id)}
                      className="flex flex-col items-center gap-1.5 shrink-0"
                      style={{ width: `${100 / fases.length}%` }}
                    >
                      <div
                        className="size-8 rounded-full flex items-center justify-center text-[12px] font-semibold"
                        style={{
                          background: isDone ? "#15803D" : isCurrent ? "var(--accent)" : "var(--secondary)",
                          color: isDone || isCurrent ? "#fff" : "var(--muted-foreground)",
                        }}
                      >
                        {isDone ? <Check className="size-4" /> : fase.ordem}
                      </div>
                      <span className={cn("text-[10.5px] text-center leading-tight", isCurrent && "font-semibold")}>
                        {fase.nome_fase}
                      </span>
                    </button>
                    {i < fases.length - 1 && (
                      <div className="flex-1 h-px mx-1 mb-5" style={{ background: isDone ? "#15803D" : "var(--border)" }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Solicitações vinculadas</h2>
          {solicitacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação vinculada a esse contrato ainda.</p>
          ) : (
            <div className="space-y-2">
              {solicitacoes.map((s) => (
                <Link
                  key={s.id}
                  to="/$produto/$empresa/solicitacoes/$id"
                  params={{ produto, empresa: empresaSlug, id: s.id }}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 hover:border-ring"
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="text-sm flex-1">{s.titulo}</span>
                  <span className="text-[11px] text-muted-foreground">{s.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
    </main>
  );
}
