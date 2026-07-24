import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa, useProdutoAtual, useIsEmpresaAdmin, produtoInfo } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ChevronLeft, Plus, Sparkles, User } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/configuracao")({
  component: ConfiguracaoPage,
});

interface Papel {
  id: string;
  nome: string;
}

interface EtapaConfig {
  id: string;
  ordem: number;
  nome_etapa: string;
  responsavel_tipo: "papel" | "ia";
  papel_id: string | null;
  obrigatoria: boolean;
  ativo: boolean;
}

function usePapeis(empresaId: string) {
  return useQuery({
    queryKey: ["papeis", empresaId],
    queryFn: async (): Promise<Papel[]> => {
      const { data, error } = await supabase.from("papeis_empresa").select("id, nome").eq("empresa_id", empresaId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useEtapasConfig(empresaId: string, produto: string) {
  return useQuery({
    queryKey: ["etapas-config", empresaId, produto],
    queryFn: async (): Promise<EtapaConfig[]> => {
      const { data, error } = await supabase
        .from("configuracao_fluxo")
        .select("id, ordem, nome_etapa, responsavel_tipo, papel_id, obrigatoria, ativo")
        .eq("empresa_id", empresaId)
        .eq("produto", produto)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as EtapaConfig[];
    },
  });
}

interface FaseConfig {
  id: string;
  ordem: number;
  nome_fase: string;
  ativo: boolean;
}

function useFasesConfig(empresaId: string, produto: string) {
  return useQuery({
    queryKey: ["fases-config", empresaId, produto],
    queryFn: async (): Promise<FaseConfig[]> => {
      const { data, error } = await supabase
        .from("fases_config")
        .select("id, ordem, nome_fase, ativo")
        .eq("empresa_id", empresaId)
        .eq("produto", produto)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function FasesSection({ empresaId, produto }: { empresaId: string; produto: string }) {
  const qc = useQueryClient();
  const { data: fases = [], isLoading } = useFasesConfig(empresaId, produto);

  const aplicarModeloMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("aplicar_modelo_fases_padrao", { p_empresa_id: empresaId, p_produto: produto });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fases-config", empresaId, produto] }),
  });

  const toggleAtivoMut = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("fases_config").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fases-config", empresaId, produto] }),
  });

  return (
    <section>
      <h2 className="text-sm font-semibold mb-2">Fases do processo (opcional)</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Ative isso só se quiser agrupar várias solicitações dentro de um contrato, acompanhando
        a fase atual dele (planejamento, contratação, mobilização, execução, encerramento).
        Sem isso, cada solicitação funciona isolada normalmente.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : fases.length === 0 ? (
        <Button
          onClick={() => aplicarModeloMut.mutate()}
          disabled={aplicarModeloMut.isPending}
          variant="outline"
          className="h-9"
        >
          Ativar fases do processo
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          {fases.map((f) => (
            <div key={f.id} className={cn("flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3", !f.ativo && "opacity-50")}>
              <span className="text-xs text-muted-foreground w-5">{f.ordem}</span>
              <span className="flex-1 text-sm">{f.nome_fase}</span>
              <Switch checked={f.ativo} onCheckedChange={(v) => toggleAtivoMut.mutate({ id: f.id, ativo: v })} />
            </div>
          ))}
        </div>
      )}
      {aplicarModeloMut.isError && <p className="text-xs text-destructive mt-2">{(aplicarModeloMut.error as Error).message}</p>}
    </section>
  );
}

function NovoPapelForm({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = React.useState("");
  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("papeis_empresa").insert({ empresa_id: empresaId, nome });
      if (error) throw error;
    },
    onSuccess: () => {
      setNome("");
      qc.invalidateQueries({ queryKey: ["papeis", empresaId] });
    },
  });
  return (
    <div className="flex gap-2">
      <Input placeholder="Nome do papel (ex: SSMA)" value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 max-w-xs" />
      <Button size="sm" disabled={!nome || createMut.isPending} onClick={() => createMut.mutate()} variant="outline">
        <Plus className="size-4 mr-1" /> Adicionar papel
      </Button>
    </div>
  );
}

function NovaEtapaForm({ empresaId, produto, papeis, proximaOrdem }: { empresaId: string; produto: string; papeis: Papel[]; proximaOrdem: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [nomeEtapa, setNomeEtapa] = React.useState("");
  const [tipo, setTipo] = React.useState<"papel" | "ia">("papel");
  const [papelId, setPapelId] = React.useState(papeis[0]?.id ?? "");
  const [obrigatoria, setObrigatoria] = React.useState(true);

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("configuracao_fluxo").insert({
        empresa_id: empresaId,
        produto,
        ordem: proximaOrdem,
        nome_etapa: nomeEtapa,
        responsavel_tipo: tipo,
        papel_id: tipo === "papel" ? papelId || null : null,
        obrigatoria,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNomeEtapa("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["etapas-config", empresaId, produto] });
    },
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="h-9 px-4 text-sm bg-primary text-primary-foreground">
        <Plus className="size-4 mr-1" /> Nova etapa
      </Button>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-2.5 bg-card">
      <Input placeholder="Nome da etapa (ex: SSMA verifica requisitos)" value={nomeEtapa} onChange={(e) => setNomeEtapa(e.target.value)} className="h-9" />
      <div className="flex gap-2">
        {(["papel", "ia"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={cn("h-9 px-3 rounded-md text-xs border", tipo === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}
          >
            {t === "papel" ? "Papel interno" : "IA (decide sozinha)"}
          </button>
        ))}
      </div>
      {tipo === "papel" && (
        <select value={papelId} onChange={(e) => setPapelId(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
          {papeis.length === 0 && <option value="">Cadastre um papel primeiro</option>}
          {papeis.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={obrigatoria} onCheckedChange={setObrigatoria} /> Etapa obrigatória
      </label>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button size="sm" disabled={!nomeEtapa || createMut.isPending} onClick={() => createMut.mutate()} className="bg-primary text-primary-foreground">
          Criar etapa
        </Button>
      </div>
    </div>
  );
}

function ConfiguracaoPage() {
  const empresa = useEmpresa();
  const produto = useProdutoAtual();
  const info = produtoInfo(produto)!;
  const { isAdmin, isLoading: checkingAdmin } = useIsEmpresaAdmin();
  const { data: papeis = [] } = usePapeis(empresa.id);
  const { data: etapas = [], isLoading } = useEtapasConfig(empresa.id, produto);
  const qc = useQueryClient();

  const toggleAtivoMut = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("configuracao_fluxo").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["etapas-config", empresa.id, produto] }),
  });

  if (checkingAdmin) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-svh grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-2">Configuração de fluxo é exclusiva pra donos/admins de {empresa.nome}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header style={{ background: "var(--primary)" }}>
        <div className="max-w-3xl mx-auto px-5 py-3.5">
          <Link
            to="/$produto/$empresa"
            params={{ produto, empresa: empresa.slug }}
            className="text-[13px] flex items-center gap-1 text-primary-foreground/70 hover:text-primary-foreground w-fit"
          >
            <ChevronLeft className="size-3.5" /> Voltar
          </Link>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] mt-2" style={{ color: "var(--accent)" }}>
            {info.nome} · {empresa.nome}
          </p>
          <h1 className="text-[19px] font-semibold text-primary-foreground">Configuração do fluxo</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-6">
        <section>
          <h2 className="text-sm font-semibold mb-2">Papéis internos</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {papeis.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-secondary">
                <User className="size-3" /> {p.nome}
              </span>
            ))}
          </div>
          <NovoPapelForm empresaId={empresa.id} />
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">Etapas de aprovação</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="flex flex-col gap-2 mb-3">
              {etapas.map((etapa) => (
                <div key={etapa.id} className={cn("flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3", !etapa.ativo && "opacity-50")}>
                  <span className="text-xs text-muted-foreground w-5">{etapa.ordem}</span>
                  {etapa.responsavel_tipo === "ia" ? <Sparkles className="size-4 text-accent shrink-0" /> : <User className="size-4 text-muted-foreground shrink-0" />}
                  <span className="flex-1 text-sm">{etapa.nome_etapa}</span>
                  {!etapa.obrigatoria && <span className="text-[11px] text-muted-foreground">opcional</span>}
                  <Switch checked={etapa.ativo} onCheckedChange={(v) => toggleAtivoMut.mutate({ id: etapa.id, ativo: v })} />
                </div>
              ))}
            </div>
          )}
          <NovaEtapaForm empresaId={empresa.id} produto={produto} papeis={papeis} proximaOrdem={(etapas.at(-1)?.ordem ?? 0) + 1} />
        </section>

        <FasesSection empresaId={empresa.id} produto={produto} />
      </main>
    </div>
  );
}
