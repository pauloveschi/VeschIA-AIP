import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PRODUTOS } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/superadmin")({
  component: SuperAdminPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function useIsSuperAdmin() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["is-super-admin", user?.id],
    enabled: !!user && !loading,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from("profiles").select("is_super_admin").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data?.is_super_admin ?? false;
    },
  });
}

interface EmpresaRow {
  id: string;
  slug: string;
  nome: string;
  status: string;
  produtos: string[];
}

function useEmpresas() {
  return useQuery({
    queryKey: ["all-empresas"],
    queryFn: async (): Promise<EmpresaRow[]> => {
      const { data, error } = await supabase
        .from("empresas_clientes")
        .select("id, slug, nome, status, empresa_produtos(produto, ativo)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id,
        slug: e.slug,
        nome: e.nome,
        status: e.status,
        produtos: ((e.empresa_produtos ?? []) as { produto: string; ativo: boolean }[]).filter((p) => p.ativo).map((p) => p.produto),
      }));
    },
  });
}

const SEGMENTOS = [
  { slug: "industrial", nome: "Industrial" },
  { slug: "imobiliario", nome: "Imobiliário" },
  { slug: "prestacao_servicos", nome: "Prestação de Serviços" },
  { slug: "engenharia", nome: "Engenharia" },
  { slug: "saude", nome: "Saúde" },
  { slug: "energia", nome: "Energia" },
  { slug: "agronegocio", nome: "Agronegócio" },
] as const;

function NovaEmpresaForm() {
  const qc = useQueryClient();
  const [nome, setNome] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [produto, setProduto] = React.useState<string>(PRODUTOS[0].slug);
  const [emailDono, setEmailDono] = React.useState("");
  const [modeloNegocio, setModeloNegocio] = React.useState<"setorial_profissional" | "empresarial_padrao">("empresarial_padrao");
  const [segmento, setSegmento] = React.useState<string>(SEGMENTOS[0].slug);

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: empresa, error } = await supabase
        .from("empresas_clientes")
        .insert({ nome, slug: slug || slugify(nome), status: "trial" })
        .select()
        .single();
      if (error) throw error;

      const { error: prodErr } = await supabase.from("empresa_produtos").insert({ empresa_id: empresa.id, produto });
      if (prodErr) throw prodErr;

      // Só o AIProCont tem os templates de fluxo prontos até agora
      if (produto === "aiprocont") {
        if (modeloNegocio === "setorial_profissional") {
          const { error: rpcErr } = await supabase.rpc("aplicar_modelo_setorial_profissional", {
            p_empresa_id: empresa.id,
            p_segmento: segmento,
          });
          if (rpcErr) throw rpcErr;
        } else {
          const { error: rpcErr } = await supabase.rpc("aplicar_modelo_empresarial_padrao", {
            p_empresa_id: empresa.id,
          });
          if (rpcErr) throw rpcErr;
        }
      }

      if (emailDono) {
        const { data: existingUser } = await supabase.from("profiles").select("id").eq("email", emailDono).maybeSingle();
        if (existingUser) {
          await supabase.from("membros").insert({ empresa_id: empresa.id, user_id: existingUser.id, role: "owner" });
        } else {
          throw new Error(`Empresa criada, mas ${emailDono} ainda não tem conta. Peça pra criar em /${produto}/${empresa.slug}/auth e volte aqui pra vincular.`);
        }
      }
      return empresa;
    },
    onSuccess: () => {
      setNome("");
      setSlug("");
      setEmailDono("");
      qc.invalidateQueries({ queryKey: ["all-empresas"] });
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-lg font-semibold">Nova empresa cliente</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider">Nome da empresa</Label>
          <Input value={nome} onChange={(e) => { setNome(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider">Slug (URL)</Label>
          <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="souza-advocacia" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider">Produto contratado</Label>
          <select value={produto} onChange={(e) => setProduto(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
            {PRODUTOS.map((p) => (
              <option key={p.slug} value={p.slug}>{p.nome} ({p.processo})</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider">E-mail do dono (opcional, precisa já ter conta)</Label>
          <Input type="email" value={emailDono} onChange={(e) => setEmailDono(e.target.value)} />
        </div>
        {produto === "aiprocont" && (
          <>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider">Modelo de negócio</Label>
              <select
                value={modeloNegocio}
                onChange={(e) => setModeloNegocio(e.target.value as typeof modeloNegocio)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="empresarial_padrao">Empresarial Padrão (fluxo enxuto)</option>
                <option value="setorial_profissional">Setorial Profissional (fluxo especializado)</option>
              </select>
            </div>
            {modeloNegocio === "setorial_profissional" && (
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider">Segmento</Label>
                <select
                  value={segmento}
                  onChange={(e) => setSegmento(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {SEGMENTOS.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.nome}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>
      {createMut.isError && <p className="text-xs text-destructive">{(createMut.error as Error).message}</p>}
      <Button disabled={!nome || !slug || createMut.isPending} onClick={() => createMut.mutate()} className="bg-primary text-primary-foreground">
        Criar empresa
      </Button>
    </div>
  );
}

function SuperAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { data: isSuperAdmin, isLoading: checking } = useIsSuperAdmin();
  const { data: empresas = [], isLoading } = useEmpresas();

  if (authLoading || checking) {
    return <div className="min-h-svh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-svh grid place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-muted-foreground mb-4">Faça login com sua conta VeschIA.</p>
          <Link
            to="/auth"
            search={{ redirect: "/superadmin", mode: "signin" }}
            className="inline-flex h-11 px-6 rounded-full bg-primary text-primary-foreground items-center text-sm"
          >
            Entrar
          </Link>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-svh grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-2">Essa área é exclusiva da equipe VeschIA.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header style={{ background: "var(--primary)" }}>
        <div className="max-w-3xl mx-auto px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>VeschIA AIP</p>
          <h1 className="text-xl font-semibold text-primary-foreground">Painel interno · empresas cadastradas</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        <NovaEmpresaForm />

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold mb-3">Empresas ativas</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : empresas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {empresas.map((e) => (
                <li key={e.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{e.nome}</p>
                      <p className="text-xs text-muted-foreground">{e.status}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {e.produtos.map((p) => (
                      <Link key={p} to="/$produto/$empresa" params={{ produto: p, empresa: e.slug }} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary hover:bg-accent/20">
                        /{p}/{e.slug}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
