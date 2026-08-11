import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useEmpresa, useProdutoAtual } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, FileStack } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/contratos")({
  component: ContratosPage,
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
  status: string;
  fase_atual_id: string | null;
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

function useContratos(empresaId: string) {
  return useQuery({
    queryKey: ["contratos", empresaId],
    queryFn: async (): Promise<Contrato[]> => {
      const { data, error } = await supabase
        .from("contratos")
        .select("id, numero, titulo, fornecedor_nome, valor, status, fase_atual_id")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => ({ ...c, valor: c.valor != null ? Number(c.valor) : null }));
    },
  });
}

function NovoContratoForm({ empresaId, fases, onCreated }: { empresaId: string; fases: FaseConfig[]; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [titulo, setTitulo] = React.useState("");
  const [fornecedor, setFornecedor] = React.useState("");
  const [valor, setValor] = React.useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      const primeiraFase = fases[0]?.id ?? null;
      const { error } = await supabase.from("contratos").insert({
        empresa_id: empresaId,
        titulo,
        fornecedor_nome: fornecedor || null,
        valor,
        fase_atual_id: primeiraFase,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitulo("");
      setFornecedor("");
      setValor(null);
      setOpen(false);
      onCreated();
    },
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="h-9 px-4 text-sm" variant="confirmar">
        <Plus className="size-4 mr-1" /> Novo contrato
      </Button>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-2.5 bg-card">
      <h3 className="text-sm font-medium">Novo contrato</h3>
      <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9" />
      <Input placeholder="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className="h-9" />
      <CurrencyInput valueReais={valor} onChangeReais={setValor} className="h-9" />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button size="sm" disabled={!titulo || createMut.isPending} onClick={() => createMut.mutate()} variant="confirmar">
          Criar
        </Button>
      </div>
    </div>
  );
}

function ContratosPage() {
  const empresa = useEmpresa();
  const produto = useProdutoAtual();
  const { user, loading: authLoading } = useAuth();
  const { data: fases = [] } = useFases(empresa.id, produto);
  const { data: contratos = [], isLoading } = useContratos(empresa.id);
  const qc = useQueryClient();

  const faseNome = (id: string | null) => fases.find((f) => f.id === id)?.nome_fase ?? "—";

  if (authLoading) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-svh grid place-items-center px-4 text-center">
        <p className="text-sm text-muted-foreground">Faça login pra acessar os contratos.</p>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-5 py-6 space-y-3">
      <h1 className="text-xl font-semibold">Contratos</h1>
      {fases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Essa empresa ainda não ativou o acompanhamento por fases. Vá em Configuração pra ativar.
          </p>
        ) : (
          <NovoContratoForm empresaId={empresa.id} fases={fases} onCreated={() => qc.invalidateQueries({ queryKey: ["contratos", empresa.id] })} />
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : contratos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum contrato ainda.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {contratos.map((c) => (
              <Link
                key={c.id}
                to="/$produto/$empresa/contratos/$id"
                params={{ produto, empresa: empresa.slug, id: c.id }}
                className="rounded-xl border border-border bg-card p-4 hover:border-ring transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] text-muted-foreground">#{c.numero}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-secondary">
                    <FileStack className="size-3" /> {faseNome(c.fase_atual_id)}
                  </span>
                </div>
                <h3 className="text-[15px] font-semibold mt-1.5">{c.titulo}</h3>
                {c.fornecedor_nome && <p className="text-[12.5px] text-muted-foreground">{c.fornecedor_nome}</p>}
                {c.valor != null && (
                  <p className="mt-2 font-semibold" style={{ color: "var(--accent)" }}>
                    {c.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
    </main>
  );
}
