import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ChevronLeft, Plus, Building2, User, Trophy, Ban } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/solicitacoes/$id/negociacao")({
  component: NegociacaoPage,
});

type TipoPessoa = "juridica" | "fisica";
type StatusNegociacao = "participante" | "escolhida" | "descartada";

interface Negociacao {
  id: string;
  tipo_pessoa: TipoPessoa;
  fornecedor_nome: string;
  fornecedor_documento: string;
  fornecedor_nacionalidade: string | null;
  fornecedor_estado_civil: string | null;
  fornecedor_profissao: string | null;
  fornecedor_cep: string | null;
  fornecedor_logradouro: string | null;
  fornecedor_numero: string | null;
  fornecedor_complemento: string | null;
  fornecedor_bairro: string | null;
  fornecedor_cidade: string | null;
  fornecedor_estado: string | null;
  status: StatusNegociacao;
  objeto_contrato: string | null;
  detalhes_servico: string | null;
  valor_negociado: number | null;
  condicoes: string | null;
  vigencia_dias: number | null;
  data_inicio: string | null;
  data_termino: string | null;
  email_contratante: string | null;
  email_contratado: string | null;
  testemunha_1_nome: string | null;
  testemunha_1_email: string | null;
  testemunha_2_nome: string | null;
  testemunha_2_email: string | null;
  justificativa_escolha: string | null;
}

/** Remove tudo que não é dígito. */
function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function formatDocumento(v: string, tipo: TipoPessoa) {
  const d = onlyDigits(v);
  if (tipo === "fisica") {
    return d
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function validarCPF(cpfRaw: string): boolean {
  const c = onlyDigits(cpfRaw);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(c[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(c[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(c[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(c[10]);
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
  const d1 = calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(c[12])) return false;
  const d2 = calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(c[13]);
}

function validarDocumento(v: string, tipo: TipoPessoa) {
  return tipo === "fisica" ? validarCPF(v) : validarCNPJ(v);
}

/** Soma dias a uma data (string yyyy-mm-dd) e devolve string yyyy-mm-dd. */
function somarDias(dataInicioISO: string, dias: number): string {
  const d = new Date(dataInicioISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function useNegociacoes(solicitacaoId: string) {
  return useQuery({
    queryKey: ["negociacoes", solicitacaoId],
    queryFn: async (): Promise<Negociacao[]> => {
      const { data, error } = await supabase
        .from("negociacoes")
        .select("*")
        .eq("solicitacao_id", solicitacaoId)
        .order("data_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((n) => ({ ...n, valor_negociado: n.valor_negociado != null ? Number(n.valor_negociado) : null })) as Negociacao[];
    },
  });
}

const statusMeta: Record<StatusNegociacao, { label: string; fg: string; bg: string }> = {
  participante: { label: "Participante", fg: "var(--ops-em-analise)", bg: "var(--ops-em-analise-bg)" },
  escolhida: { label: "Escolhida", fg: "var(--ops-aprovada)", bg: "var(--ops-aprovada-bg)" },
  descartada: { label: "Descartada", fg: "var(--muted-foreground)", bg: "var(--muted)" },
};

function StatusBadge({ status }: { status: StatusNegociacao }) {
  const m = statusMeta[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold" style={{ color: m.fg, background: m.bg }}>
      {m.label}
    </span>
  );
}

function NovoFornecedorForm({ solicitacaoId, onCreated }: { solicitacaoId: string; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [tipoPessoa, setTipoPessoa] = React.useState<TipoPessoa>("juridica");
  const [nome, setNome] = React.useState("");
  const [documento, setDocumento] = React.useState("");
  const [nacionalidade, setNacionalidade] = React.useState("");
  const [estadoCivil, setEstadoCivil] = React.useState("");
  const [profissao, setProfissao] = React.useState("");
  const [cep, setCep] = React.useState("");
  const [logradouro, setLogradouro] = React.useState("");
  const [numero, setNumero] = React.useState("");
  const [complemento, setComplemento] = React.useState("");
  const [bairro, setBairro] = React.useState("");
  const [cidade, setCidade] = React.useState("");
  const [estado, setEstado] = React.useState("");
  const [buscandoCep, setBuscandoCep] = React.useState(false);
  const [objetoContrato, setObjetoContrato] = React.useState("");
  const [detalhesServico, setDetalhesServico] = React.useState("");
  const [valorNegociado, setValorNegociado] = React.useState<number | null>(null);
  const [condicoes, setCondicoes] = React.useState("");
  const [vigenciaDias, setVigenciaDias] = React.useState("");
  const [dataInicio, setDataInicio] = React.useState("");
  const [emailContratante, setEmailContratante] = React.useState("");
  const [emailContratado, setEmailContratado] = React.useState("");
  const [testemunha1Nome, setTestemunha1Nome] = React.useState("");
  const [testemunha1Email, setTestemunha1Email] = React.useState("");
  const [testemunha2Nome, setTestemunha2Nome] = React.useState("");
  const [testemunha2Email, setTestemunha2Email] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);

  const dataTermino = dataInicio && vigenciaDias ? somarDias(dataInicio, Number(vigenciaDias) - 30) : null;

  const buscarCep = async () => {
    const digits = onlyDigits(cep);
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await resp.json();
      if (!data.erro) {
        setLogradouro(data.logradouro ?? "");
        setBairro(data.bairro ?? "");
        setCidade(data.localidade ?? "");
        setEstado(data.uf ?? "");
      }
    } catch {
      // silencioso: CEP não achado não deve travar o cadastro, o negociador preenche manual
    } finally {
      setBuscandoCep(false);
    }
  };

  const reset = () => {
    setTipoPessoa("juridica");
    setNome("");
    setDocumento("");
    setNacionalidade("");
    setEstadoCivil("");
    setProfissao("");
    setCep("");
    setLogradouro("");
    setNumero("");
    setComplemento("");
    setBairro("");
    setCidade("");
    setEstado("");
    setObjetoContrato("");
    setDetalhesServico("");
    setValorNegociado(null);
    setCondicoes("");
    setVigenciaDias("");
    setDataInicio("");
    setEmailContratante("");
    setEmailContratado("");
    setTestemunha1Nome("");
    setTestemunha1Email("");
    setTestemunha2Nome("");
    setTestemunha2Email("");
    setErro(null);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!validarDocumento(documento, tipoPessoa)) {
        throw new Error(tipoPessoa === "fisica" ? "CPF inválido." : "CNPJ inválido.");
      }
      const { error } = await supabase.from("negociacoes").insert({
        solicitacao_id: solicitacaoId,
        tipo_pessoa: tipoPessoa,
        fornecedor_nome: nome,
        fornecedor_documento: onlyDigits(documento),
        fornecedor_nacionalidade: tipoPessoa === "fisica" ? nacionalidade || null : null,
        fornecedor_estado_civil: tipoPessoa === "fisica" ? estadoCivil || null : null,
        fornecedor_profissao: tipoPessoa === "fisica" ? profissao || null : null,
        fornecedor_cep: cep || null,
        fornecedor_logradouro: logradouro || null,
        fornecedor_numero: numero || null,
        fornecedor_complemento: complemento || null,
        fornecedor_bairro: bairro || null,
        fornecedor_cidade: cidade || null,
        fornecedor_estado: estado || null,
        objeto_contrato: objetoContrato || null,
        detalhes_servico: detalhesServico || null,
        valor_negociado: valorNegociado,
        condicoes: condicoes || null,
        vigencia_dias: vigenciaDias ? Number(vigenciaDias) : null,
        data_inicio: dataInicio || null,
        data_termino: dataTermino,
        email_contratante: emailContratante || null,
        email_contratado: emailContratado || null,
        testemunha_1_nome: testemunha1Nome || null,
        testemunha_1_email: testemunha1Email || null,
        testemunha_2_nome: testemunha2Nome || null,
        testemunha_2_email: testemunha2Email || null,
      });
      if (error) throw error;
    },
    onError: (e: Error) => setErro(e.message),
    onSuccess: () => {
      reset();
      setOpen(false);
      onCreated();
    },
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="h-9 px-4 text-sm bg-primary text-primary-foreground">
        <Plus className="size-4 mr-1" /> Cadastrar empresa participante
      </Button>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-3 bg-card">
      <h3 className="text-sm font-medium">Nova empresa participante</h3>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={tipoPessoa === "juridica" ? "default" : "outline"}
          className={tipoPessoa === "juridica" ? "bg-primary text-primary-foreground" : ""}
          onClick={() => setTipoPessoa("juridica")}
        >
          <Building2 className="size-3.5 mr-1" /> Pessoa Jurídica
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tipoPessoa === "fisica" ? "default" : "outline"}
          className={tipoPessoa === "fisica" ? "bg-primary text-primary-foreground" : ""}
          onClick={() => setTipoPessoa("fisica")}
        >
          <User className="size-3.5 mr-1" /> Pessoa Física
        </Button>
      </div>

      <Input
        placeholder={tipoPessoa === "fisica" ? "Nome completo" : "Razão social"}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        className="h-9"
      />
      <Input
        placeholder={tipoPessoa === "fisica" ? "CPF" : "CNPJ"}
        value={documento}
        onChange={(e) => setDocumento(formatDocumento(e.target.value, tipoPessoa))}
        className="h-9"
      />

      {tipoPessoa === "fisica" && (
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="Nacionalidade" value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} className="h-9" />
          <Input placeholder="Estado civil" value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)} className="h-9" />
          <Input placeholder="Profissão" value={profissao} onChange={(e) => setProfissao(e.target.value)} className="h-9" />
        </div>
      )}

      <div className="flex gap-2">
        <Input placeholder="CEP" value={cep} onChange={(e) => setCep(e.target.value)} onBlur={buscarCep} className="h-9 w-32" />
        <Button type="button" size="sm" variant="outline" disabled={buscandoCep} onClick={buscarCep}>
          {buscandoCep ? "Buscando…" : "Buscar CEP"}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} className="h-9" />
        <Input placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} className="h-9" />
        <Input placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} className="h-9" />
        <Input placeholder="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="h-9" />
        <Input placeholder="Número" value={numero} onChange={(e) => setNumero(e.target.value)} className="h-9" />
        <Input placeholder="Complemento" value={complemento} onChange={(e) => setComplemento(e.target.value)} className="h-9" />
      </div>

      <Textarea placeholder="Objeto do contrato" value={objetoContrato} onChange={(e) => setObjetoContrato(e.target.value)} className="min-h-16" />
      <Textarea placeholder="Detalhes do serviço" value={detalhesServico} onChange={(e) => setDetalhesServico(e.target.value)} className="min-h-16" />

      <CurrencyInput valueReais={valorNegociado} onChangeReais={setValorNegociado} placeholder="Valor negociado" className="h-9" />
      <Textarea placeholder="Condições (pagamento, parcelamento, etc)" value={condicoes} onChange={(e) => setCondicoes(e.target.value)} className="min-h-16" />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[12px] text-muted-foreground">Data de início</label>
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-9" />
        </div>
        <div>
          <label className="text-[12px] text-muted-foreground">Vigência (dias)</label>
          <Input type="number" placeholder="Ex: 180" value={vigenciaDias} onChange={(e) => setVigenciaDias(e.target.value)} className="h-9" />
        </div>
      </div>
      {dataTermino && (
        <p className="text-[12px] text-muted-foreground">
          Data de término no contrato (já com os 30 dias de antecedência pra renovação): <strong>{new Date(dataTermino + "T00:00:00").toLocaleDateString("pt-BR")}</strong>
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="E-mail de assinatura · Contratante" value={emailContratante} onChange={(e) => setEmailContratante(e.target.value)} className="h-9" />
        <Input placeholder="E-mail de assinatura · Contratado" value={emailContratado} onChange={(e) => setEmailContratado(e.target.value)} className="h-9" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Testemunha 1 · Nome" value={testemunha1Nome} onChange={(e) => setTestemunha1Nome(e.target.value)} className="h-9" />
        <Input placeholder="Testemunha 1 · E-mail" value={testemunha1Email} onChange={(e) => setTestemunha1Email(e.target.value)} className="h-9" />
        <Input placeholder="Testemunha 2 · Nome" value={testemunha2Nome} onChange={(e) => setTestemunha2Nome(e.target.value)} className="h-9" />
        <Input placeholder="Testemunha 2 · E-mail" value={testemunha2Email} onChange={(e) => setTestemunha2Email(e.target.value)} className="h-9" />
      </div>

      {erro && <p className="text-[12px] text-destructive">{erro}</p>}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => { reset(); setOpen(false); }}>Cancelar</Button>
        <Button size="sm" disabled={!nome || !documento || createMut.isPending} onClick={() => createMut.mutate()} className="bg-primary text-primary-foreground">
          Cadastrar
        </Button>
      </div>
    </div>
  );
}

function EscolherFornecedor({ negociacao, solicitacaoId, onDone }: { negociacao: Negociacao; solicitacaoId: string; onDone: () => void }) {
  const [expandido, setExpandido] = React.useState(false);
  const [justificativa, setJustificativa] = React.useState("");

  const escolherMut = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase
        .from("negociacoes")
        .update({ status: "escolhida", justificativa_escolha: justificativa })
        .eq("id", negociacao.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("negociacoes")
        .update({ status: "descartada" })
        .eq("solicitacao_id", solicitacaoId)
        .eq("status", "participante")
        .neq("id", negociacao.id);
      if (e2) throw e2;

      const { error: e3 } = await supabase
        .from("solicitacoes")
        .update({ valor: negociacao.valor_negociado, fornecedor_nome: negociacao.fornecedor_nome })
        .eq("id", solicitacaoId);
      if (e3) throw e3;

      const { data: etapaNegociacao, error: e4 } = await supabase
        .from("etapas_execucao")
        .select("id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa)")
        .eq("solicitacao_id", solicitacaoId);
      if (e4) throw e4;

      const etapa = (etapaNegociacao ?? []).find(
        (e: any) => e.configuracao_fluxo?.nome_etapa === "Negociação Comercial",
      );
      if (etapa) {
        await supabase.from("etapas_execucao").update({ status: "aprovada", decidido_em: new Date().toISOString() }).eq("id", etapa.id);
      }
    },
    onSuccess: () => onDone(),
  });

  if (negociacao.status !== "participante") return null;

  if (!expandido) {
    return (
      <Button size="sm" className="h-8 bg-primary text-primary-foreground" onClick={() => setExpandido(true)}>
        <Trophy className="size-3.5 mr-1" /> Escolher esta empresa
      </Button>
    );
  }

  return (
    <div className="space-y-2 w-full">
      <Textarea
        placeholder="Justificativa da escolha (protege contra questionamento de compliance: por que essa e não outra)"
        value={justificativa}
        onChange={(e) => setJustificativa(e.target.value)}
        className="min-h-16 text-[13px]"
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => setExpandido(false)}>Cancelar</Button>
        <Button
          size="sm"
          disabled={!justificativa || escolherMut.isPending}
          onClick={() => escolherMut.mutate()}
          className="bg-primary text-primary-foreground"
        >
          Confirmar escolha
        </Button>
      </div>
    </div>
  );
}

function NegociacaoPage() {
  const { produto, empresa: empresaSlug, id } = Route.useParams();
  useEmpresa();
  const qc = useQueryClient();
  const { data: negociacoes = [], isLoading } = useNegociacoes(id);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["negociacoes", id] });
    qc.invalidateQueries({ queryKey: ["etapas-execucao", id] });
    qc.invalidateQueries({ queryKey: ["solicitacao-detail", id] });
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
        <p className="text-sm text-muted-foreground">
          Cadastre as empresas participantes da licitação. Quando decidir, escolha uma delas: as demais ficam registradas como
          descartadas, sem perder o histórico de quem participou.
        </p>

        <NovoFornecedorForm solicitacaoId={id} onCreated={invalidate} />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : negociacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
        ) : (
          <div className="space-y-3">
            {negociacoes.map((n) => (
              <div key={n.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {n.tipo_pessoa === "fisica" ? <User className="size-3.5 text-muted-foreground" /> : <Building2 className="size-3.5 text-muted-foreground" />}
                    <span className="text-sm font-medium">{n.fornecedor_nome}</span>
                  </div>
                  <StatusBadge status={n.status} />
                </div>
                <p className="text-[12px] text-muted-foreground font-mono">{formatDocumento(n.fornecedor_documento, n.tipo_pessoa)}</p>
                {n.objeto_contrato && <p className="text-[13px]">{n.objeto_contrato}</p>}
                {n.valor_negociado != null && (
                  <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
                    {n.valor_negociado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                )}
                {n.status === "escolhida" && n.justificativa_escolha && (
                  <p className="text-[12px] text-muted-foreground italic">Justificativa: {n.justificativa_escolha}</p>
                )}
                {n.status === "descartada" && (
                  <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <Ban className="size-3" /> Não escolhida, mantida no histórico
                  </p>
                )}
                <div>
                  <EscolherFornecedor negociacao={n} solicitacaoId={id} onDone={invalidate} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
