import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PRODUTOS } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, AlertCircle, PlayCircle } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";

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

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function formatCnpj(v: string) {
  return onlyDigits(v)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function validarCNPJ(cnpjRaw: string): boolean {
  const c = onlyDigits(cnpjRaw);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (pesos: number[]) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += Number(c[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  if (calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) !== Number(c[12])) return false;
  return calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(c[13]);
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
  razao_social: string | null;
  cnpj: string | null;
  email_cadastro: string | null;
  endereco_cep: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_estado: string | null;
  status: string;
  produtos: string[];
}

function useEmpresas() {
  return useQuery({
    queryKey: ["all-empresas"],
    queryFn: async (): Promise<EmpresaRow[]> => {
      const { data, error } = await supabase
        .from("empresas_clientes")
        .select(
          "id, slug, nome, razao_social, cnpj, email_cadastro, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, status, empresa_produtos(produto, ativo)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((e) => ({
        ...e,
        produtos: ((e.empresa_produtos ?? []) as { produto: string; ativo: boolean }[]).filter((p) => p.ativo).map((p) => p.produto),
      })) as EmpresaRow[];
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

interface DadosCadastrais {
  nome: string;
  razaoSocial: string;
  cnpj: string;
  emailCadastro: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const dadosVazios: DadosCadastrais = {
  nome: "",
  razaoSocial: "",
  cnpj: "",
  emailCadastro: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
};

/**
 * Campos cadastrais da empresa cliente. São os mesmos no cadastro novo e na edição,
 * e alimentam o contrato gerado (razão social, CNPJ, endereço, e a comarca do foro).
 */
function CamposCadastrais({
  dados,
  set,
  mostrarNome,
}: {
  dados: DadosCadastrais;
  set: <K extends keyof DadosCadastrais>(k: K, v: DadosCadastrais[K]) => void;
  mostrarNome: boolean;
}) {
  const [buscandoCep, setBuscandoCep] = React.useState(false);

  const buscarCep = async () => {
    const digits = onlyDigits(dados.cep);
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await resp.json();
      if (!data.erro) {
        set("logradouro", data.logradouro ?? "");
        set("bairro", data.bairro ?? "");
        set("cidade", data.localidade ?? "");
        set("estado", data.uf ?? "");
      }
    } catch {
      // CEP não encontrado não trava o cadastro, dá pra preencher na mão
    } finally {
      setBuscandoCep(false);
    }
  };

  return (
    <>
      {mostrarNome && (
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider">Nome (aparece no sistema)</Label>
          <Input value={dados.nome} onChange={(e) => set("nome", e.target.value)} />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">Razão social (usada no contrato)</Label>
        <Input
          value={dados.razaoSocial}
          onChange={(e) => set("razaoSocial", e.target.value)}
          placeholder="Startup Teste Serviços LTDA"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">CNPJ</Label>
        <Input value={dados.cnpj} onChange={(e) => set("cnpj", formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
        {dados.cnpj && !validarCNPJ(dados.cnpj) && <p className="text-[11px] text-destructive">CNPJ inválido.</p>}
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">E-mail de cadastro</Label>
        <Input type="email" value={dados.emailCadastro} onChange={(e) => set("emailCadastro", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">CEP</Label>
        <div className="flex gap-2">
          <Input value={dados.cep} onChange={(e) => set("cep", e.target.value)} onBlur={buscarCep} placeholder="60000-000" />
          <Button type="button" size="sm" variant="outline" disabled={buscandoCep} onClick={buscarCep} className="shrink-0">
            {buscandoCep ? "Buscando…" : "Buscar"}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">Logradouro</Label>
        <Input value={dados.logradouro} onChange={(e) => set("logradouro", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">Número</Label>
        <Input value={dados.numero} onChange={(e) => set("numero", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">Complemento</Label>
        <Input value={dados.complemento} onChange={(e) => set("complemento", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">Bairro</Label>
        <Input value={dados.bairro} onChange={(e) => set("bairro", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">Cidade (define a comarca do foro)</Label>
        <Input value={dados.cidade} onChange={(e) => set("cidade", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider">Estado (UF)</Label>
        <Input value={dados.estado} onChange={(e) => set("estado", e.target.value)} maxLength={2} />
      </div>
    </>
  );
}

function linhaDbCadastro(d: DadosCadastrais) {
  return {
    razao_social: d.razaoSocial || null,
    cnpj: d.cnpj ? onlyDigits(d.cnpj) : null,
    email_cadastro: d.emailCadastro || null,
    endereco_cep: d.cep || null,
    endereco_logradouro: d.logradouro || null,
    endereco_numero: d.numero || null,
    endereco_complemento: d.complemento || null,
    endereco_bairro: d.bairro || null,
    endereco_cidade: d.cidade || null,
    endereco_estado: d.estado || null,
  };
}

function NovaEmpresaForm() {
  const qc = useQueryClient();
  const [dados, setDados] = React.useState<DadosCadastrais>(dadosVazios);
  const [slug, setSlug] = React.useState("");
  const [produto, setProduto] = React.useState<string>(PRODUTOS[0].slug);
  const [emailDono, setEmailDono] = React.useState("");
  const [modeloNegocio, setModeloNegocio] = React.useState<"setorial_profissional" | "empresarial_padrao">("empresarial_padrao");
  const [segmento, setSegmento] = React.useState<string>(SEGMENTOS[0].slug);

  const set = <K extends keyof DadosCadastrais>(k: K, v: DadosCadastrais[K]) => {
    setDados((prev) => ({ ...prev, [k]: v }));
    if (k === "nome" && !slug) setSlug(slugify(String(v)));
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: empresa, error } = await supabase
        .from("empresas_clientes")
        .insert({ nome: dados.nome, slug: slug || slugify(dados.nome), status: "trial", ...linhaDbCadastro(dados) })
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
      setDados(dadosVazios);
      setSlug("");
      setEmailDono("");
      qc.invalidateQueries({ queryKey: ["all-empresas"] });
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-lg font-semibold">Nova empresa cliente</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <CamposCadastrais dados={dados} set={set} mostrarNome />
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
      <Button disabled={!dados.nome || !slug || createMut.isPending} onClick={() => createMut.mutate()} className="bg-primary text-primary-foreground">
        Criar empresa
      </Button>
    </div>
  );
}

function EditarEmpresaForm({ empresa, onDone }: { empresa: EmpresaRow; onDone: () => void }) {
  const [dados, setDados] = React.useState<DadosCadastrais>({
    nome: empresa.nome,
    razaoSocial: empresa.razao_social ?? "",
    cnpj: empresa.cnpj ? formatCnpj(empresa.cnpj) : "",
    emailCadastro: empresa.email_cadastro ?? "",
    cep: empresa.endereco_cep ?? "",
    logradouro: empresa.endereco_logradouro ?? "",
    numero: empresa.endereco_numero ?? "",
    complemento: empresa.endereco_complemento ?? "",
    bairro: empresa.endereco_bairro ?? "",
    cidade: empresa.endereco_cidade ?? "",
    estado: empresa.endereco_estado ?? "",
  });

  const set = <K extends keyof DadosCadastrais>(k: K, v: DadosCadastrais[K]) => setDados((prev) => ({ ...prev, [k]: v }));

  const salvarMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("empresas_clientes").update(linhaDbCadastro(dados)).eq("id", empresa.id);
      if (error) throw error;
    },
    onSuccess: onDone,
  });

  return (
    <div className="mt-3 rounded-lg border border-border p-3 space-y-3">
      <p className="text-[12px] text-muted-foreground">
        Esses dados alimentam o contrato gerado: razão social e CNPJ entram na cláusula das partes, e a cidade define a comarca do foro.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <CamposCadastrais dados={dados} set={set} mostrarNome={false} />
      </div>
      {salvarMut.isError && <p className="text-xs text-destructive">{(salvarMut.error as Error).message}</p>}
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button size="sm" disabled={salvarMut.isPending} onClick={() => salvarMut.mutate()} className="bg-primary text-primary-foreground">
          Salvar
        </Button>
      </div>
    </div>
  );
}

function EmpresaItem({ empresa }: { empresa: EmpresaRow }) {
  const qc = useQueryClient();
  const [editando, setEditando] = React.useState(false);
  const faltaDado = !empresa.cnpj || !empresa.endereco_cidade;

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{empresa.nome}</p>
          <p className="text-xs text-muted-foreground">{empresa.status}</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setEditando((v) => !v)}>
          <Pencil className="size-3.5 mr-1" /> {editando ? "Fechar" : "Editar cadastro"}
        </Button>
      </div>

      {faltaDado && !editando && (
        <p className="text-[11.5px] text-muted-foreground flex items-center gap-1 mt-1">
          <AlertCircle className="size-3" /> Falta CNPJ ou cidade, o contrato vai sair com esses campos em branco.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {empresa.produtos.map((p) => (
          <Link key={p} to="/$produto/$empresa" params={{ produto: p, empresa: empresa.slug }} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary hover:bg-accent/20">
            /{p}/{empresa.slug}
          </Link>
        ))}
      </div>

      {editando && (
        <EditarEmpresaForm
          empresa={empresa}
          onDone={() => {
            setEditando(false);
            qc.invalidateQueries({ queryKey: ["all-empresas"] });
          }}
        />
      )}
    </li>
  );
}


/** Roda a rotina diária na hora, pra testar sem esperar o agendador. */
const rodarRotinaAgora = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { rodarRotinaDiaria } = await import("@/rotina.server");
  return rodarRotinaDiaria(supabaseAdmin);
});

function PainelRotina() {
  const [resultado, setResultado] = React.useState<string[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const rodarMut = useMutation({
    mutationFn: async () => rodarRotinaAgora(),
    onSuccess: (r) => {
      setErro(null);
      const linhas: string[] = [`${r.processados} contrato(s) ativo(s) verificado(s).`];
      if (r.renovacoesAtivadas.length > 0) linhas.push(`Renovação ativada: ${r.renovacoesAtivadas.join(", ")}`);
      if (r.alertasPrevios.length > 0) linhas.push(`Alerta prévio enviado: ${r.alertasPrevios.join(", ")}`);
      if (r.erros.length > 0) linhas.push(`Problemas: ${r.erros.join(" | ")}`);
      if (r.renovacoesAtivadas.length === 0 && r.alertasPrevios.length === 0) {
        linhas.push("Nenhum contrato precisou de ação hoje.");
      }
      setResultado(linhas);
    },
    onError: (e: Error) => {
      setResultado(null);
      setErro(e.message);
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Rotina de contratos</h2>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          Roda sozinha uma vez por dia. Ela abre a etapa de renovação quando o contrato chega na data de término,
          e manda alerta prévio nos contratos longos. Use o botão só pra testar fora do horário.
        </p>
      </div>
      <Button variant="outline" disabled={rodarMut.isPending} onClick={() => rodarMut.mutate()}>
        <PlayCircle className="size-4 mr-1.5" /> {rodarMut.isPending ? "Rodando…" : "Rodar agora"}
      </Button>
      {resultado && (
        <ul className="text-[12.5px] text-muted-foreground space-y-0.5">
          {resultado.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {erro && <p className="text-[12.5px] text-destructive">{erro}</p>}
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

        <PainelRotina />

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold mb-3">Empresas ativas</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : empresas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {empresas.map((e) => (
                <EmpresaItem key={e.id} empresa={e} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
