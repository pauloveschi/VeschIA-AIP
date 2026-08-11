import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa, useProdutoAtual, useIsEmpresaAdmin } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Plus, Sparkles, User, Cog, Trash2, ChevronUp, ChevronDown, Mail } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/configuracao")({
  component: ConfiguracaoPage,
});

interface Papel {
  id: string;
  nome: string;
  email: string | null;
}

interface EtapaConfig {
  id: string;
  ordem: number;
  nome_etapa: string;
  responsavel_tipo: "papel" | "ia" | "sistema";
  papel_id: string | null;
  obrigatoria: boolean;
  ativo: boolean;
}

function usePapeis(empresaId: string) {
  return useQuery({
    queryKey: ["papeis", empresaId],
    queryFn: async (): Promise<Papel[]> => {
      const { data, error } = await supabase.from("papeis_empresa").select("id, nome, email").eq("empresa_id", empresaId);
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
  const [novaFase, setNovaFase] = React.useState("");

  const criarFaseMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fases_config").insert({
        empresa_id: empresaId,
        produto,
        ordem: (fases.at(-1)?.ordem ?? 0) + 1,
        nome_fase: novaFase,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovaFase("");
      qc.invalidateQueries({ queryKey: ["fases-config", empresaId, produto] });
    },
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
      <h2 className="text-sm font-semibold mb-2">Fases do contrato (opcional)</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Use isso só se quiser agrupar várias solicitações dentro de um contrato, acompanhando
        a fase atual dele na aba Contratos. Sem isso, cada solicitação funciona isolada
        normalmente. O modelo de negócio (Setorial Profissional/Empresarial Padrão) já foi
        definido na criação da empresa e controla as etapas de aprovação, não as fases aqui.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {fases.map((f) => (
            <FaseRow key={f.id} fase={f} empresaId={empresaId} produto={produto} onToggleAtivo={(ativo) => toggleAtivoMut.mutate({ id: f.id, ativo })} />
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input placeholder="Nome da fase (ex: Planejamento)" value={novaFase} onChange={(e) => setNovaFase(e.target.value)} className="h-9 max-w-xs" />
        <Button size="sm" disabled={!novaFase || criarFaseMut.isPending} onClick={() => criarFaseMut.mutate()} variant="outline">
          <Plus className="size-4 mr-1" /> Adicionar fase
        </Button>
      </div>
      {criarFaseMut.isError && <p className="text-xs text-destructive mt-2">{(criarFaseMut.error as Error).message}</p>}
    </section>
  );
}


function FaseRow({
  fase,
  empresaId,
  produto,
  onToggleAtivo,
}: {
  fase: FaseConfig;
  empresaId: string;
  produto: string;
  onToggleAtivo: (ativo: boolean) => void;
}) {
  const qc = useQueryClient();
  const [erro, setErro] = React.useState<string | null>(null);

  const excluirMut = useMutation({
    mutationFn: async () => {
      const [{ count: usoSolicitacao }, { count: usoContrato }] = await Promise.all([
        supabase.from("solicitacoes").select("id", { count: "exact", head: true }).eq("fase_id", fase.id),
        supabase.from("contratos").select("id", { count: "exact", head: true }).eq("fase_atual_id", fase.id),
      ]);
      if ((usoSolicitacao ?? 0) > 0 || (usoContrato ?? 0) > 0) {
        throw new Error("Impossível excluir, já em uso");
      }
      const { error } = await supabase.from("fases_config").delete().eq("id", fase.id);
      if (error) throw error;
    },
    onError: (e: Error) => setErro(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fases-config", empresaId, produto] }),
  });

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3", !fase.ativo && "opacity-50")}>
      <span className="text-xs text-muted-foreground w-5">{fase.ordem}</span>
      <span className="flex-1 text-sm">{fase.nome_fase}</span>
      {erro && <span className="text-[11px] text-destructive">{erro}</span>}
      <Switch checked={fase.ativo} onCheckedChange={onToggleAtivo} />
      <button
        onClick={() => { setErro(null); excluirMut.mutate(); }}
        disabled={excluirMut.isPending}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function NovoPapelForm({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("papeis_empresa").insert({ empresa_id: empresaId, nome, email: email || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setNome("");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["papeis", empresaId] });
    },
  });
  return (
    <div className="flex gap-2 flex-wrap">
      <Input placeholder="Nome do papel (ex: SSMA)" value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 max-w-xs" />
      <Input
        type="email"
        placeholder="E-mail de aviso (opcional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-9 max-w-xs"
      />
      <Button size="sm" disabled={!nome || createMut.isPending} onClick={() => createMut.mutate()} variant="outline">
        <Plus className="size-4 mr-1" /> Adicionar papel
      </Button>
    </div>
  );
}


function PapelChip({ papel, empresaId }: { papel: Papel; empresaId: string }) {
  const qc = useQueryClient();
  const [erro, setErro] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState(false);
  const [email, setEmail] = React.useState(papel.email ?? "");

  const excluirMut = useMutation({
    mutationFn: async () => {
      const [{ count: usoExecucao }, { count: usoMembro }] = await Promise.all([
        supabase.from("etapas_execucao").select("id", { count: "exact", head: true }).eq("papel_resolvido_id", papel.id),
        supabase.from("membros").select("id", { count: "exact", head: true }).eq("papel_id", papel.id),
      ]);
      if ((usoExecucao ?? 0) > 0 || (usoMembro ?? 0) > 0) {
        throw new Error("Impossível excluir, já em uso");
      }
      const { error } = await supabase.from("papeis_empresa").delete().eq("id", papel.id);
      if (error) throw error;
    },
    onError: (e: Error) => setErro(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papeis", empresaId] }),
  });

  const salvarEmailMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("papeis_empresa").update({ email: email || null }).eq("id", papel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditando(false);
      qc.invalidateQueries({ queryKey: ["papeis", empresaId] });
    },
  });

  if (editando) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs bg-secondary">
        <User className="size-3" /> {papel.nome}
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e-mail de aviso"
          className="h-7 text-xs w-52"
        />
        <button onClick={() => salvarEmailMut.mutate()} disabled={salvarEmailMut.isPending} className="text-accent font-medium">
          Salvar
        </button>
        <button onClick={() => { setEmail(papel.email ?? ""); setEditando(false); }} className="text-muted-foreground">
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-secondary">
      <User className="size-3" /> {papel.nome}
      {papel.email ? (
        <span className="text-muted-foreground">· {papel.email}</span>
      ) : (
        <span className="text-muted-foreground italic">· sem e-mail</span>
      )}
      <button onClick={() => setEditando(true)} title="Definir e-mail de aviso" className="text-muted-foreground hover:text-foreground">
        <Mail className="size-3" />
      </button>
      <button
        onClick={() => { setErro(null); excluirMut.mutate(); }}
        disabled={excluirMut.isPending}
        title={erro ?? "Excluir papel"}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3" />
      </button>
      {erro && <span className="text-destructive text-[10px]">{erro}</span>}
    </span>
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
      <Button onClick={() => setOpen(true)} className="h-9 px-4 text-sm" variant="confirmar">
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
        <Button size="sm" disabled={!nomeEtapa || createMut.isPending} onClick={() => createMut.mutate()} variant="confirmar">
          Criar etapa
        </Button>
      </div>
    </div>
  );
}


function EtapaRow({
  etapa,
  empresaId,
  produto,
  etapaAnterior,
  etapaSeguinte,
  onToggleAtivo,
}: {
  etapa: EtapaConfig;
  empresaId: string;
  produto: string;
  etapaAnterior: EtapaConfig | null;
  etapaSeguinte: EtapaConfig | null;
  onToggleAtivo: (ativo: boolean) => void;
}) {
  const qc = useQueryClient();
  const [erro, setErro] = React.useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["etapas-config", empresaId, produto] });

  // Troca a "ordem" com a etapa vizinha (não precisa de coluna nova, é só swap dos valores já existentes).
  const moverMut = useMutation({
    mutationFn: async (vizinha: EtapaConfig) => {
      const { error: e1 } = await supabase.from("configuracao_fluxo").update({ ordem: vizinha.ordem }).eq("id", etapa.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("configuracao_fluxo").update({ ordem: etapa.ordem }).eq("id", vizinha.id);
      if (e2) throw e2;
    },
    onSuccess: invalidate,
  });

  const excluirMut = useMutation({
    mutationFn: async () => {
      const { count } = await supabase
        .from("etapas_execucao")
        .select("id", { count: "exact", head: true })
        .eq("configuracao_fluxo_id", etapa.id);
      if ((count ?? 0) > 0) throw new Error("Impossível excluir, já em uso");
      const { error } = await supabase.from("configuracao_fluxo").delete().eq("id", etapa.id);
      if (error) throw error;
    },
    onError: (e: Error) => setErro(e.message),
    onSuccess: invalidate,
  });

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3", !etapa.ativo && "opacity-50")}>
      <div className="flex flex-col -my-1">
        <button
          disabled={!etapaAnterior || moverMut.isPending}
          onClick={() => etapaAnterior && moverMut.mutate(etapaAnterior)}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          disabled={!etapaSeguinte || moverMut.isPending}
          onClick={() => etapaSeguinte && moverMut.mutate(etapaSeguinte)}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>
      <span className="text-xs text-muted-foreground w-5">{etapa.ordem}</span>
      {etapa.responsavel_tipo === "ia" ? (
        <Sparkles className="size-4 text-accent shrink-0" />
      ) : etapa.responsavel_tipo === "sistema" ? (
        <Cog className="size-4 text-muted-foreground shrink-0" />
      ) : (
        <User className="size-4 text-muted-foreground shrink-0" />
      )}
      <span className="flex-1 text-sm">{etapa.nome_etapa}</span>
      {!etapa.obrigatoria && <span className="text-[11px] text-muted-foreground">opcional</span>}
      {erro && <span className="text-[11px] text-destructive">{erro}</span>}
      <Switch checked={etapa.ativo} onCheckedChange={onToggleAtivo} />
      <button
        onClick={() => { setErro(null); excluirMut.mutate(); }}
        disabled={excluirMut.isPending}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function ConfiguracaoPage() {
  const empresa = useEmpresa();
  const produto = useProdutoAtual();
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
    <main className="max-w-3xl mx-auto px-5 py-6 space-y-6">
      <h1 className="text-xl font-semibold">Configuração do fluxo</h1>
      <section>
          <h2 className="text-sm font-semibold mb-2">Papéis internos</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {papeis.map((p) => (
              <PapelChip key={p.id} papel={p} empresaId={empresa.id} />
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
              {etapas.map((etapa, index) => (
                <EtapaRow
                  key={etapa.id}
                  etapa={etapa}
                  empresaId={empresa.id}
                  produto={produto}
                  etapaAnterior={index > 0 ? etapas[index - 1] : null}
                  etapaSeguinte={index < etapas.length - 1 ? etapas[index + 1] : null}
                  onToggleAtivo={(ativo) => toggleAtivoMut.mutate({ id: etapa.id, ativo })}
                />
              ))}
            </div>
          )}
          <NovaEtapaForm empresaId={empresa.id} produto={produto} papeis={papeis} proximaOrdem={(etapas.at(-1)?.ordem ?? 0) + 1} />
        </section>

      <FasesSection empresaId={empresa.id} produto={produto} />
    </main>
  );
}
