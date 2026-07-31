import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Building2, User, Trophy, Ban, Pencil, Lock } from "lucide-react";

export type TipoPessoa = "juridica" | "fisica";
export type StatusNegociacao = "participante" | "escolhida" | "descartada";

export interface Negociacao {
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

/** Operações que cada tela injeta: a interna fala direto com o banco, a externa passa pelo servidor. */
export interface NegociacaoApi {
  listar: () => Promise<Negociacao[]>;
  criar: (dados: Record<string, unknown>) => Promise<void>;
  atualizar: (id: string, dados: Record<string, unknown>) => Promise<void>;
  escolher: (id: string, justificativa: string) => Promise<void>;
}

export function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

export function formatDocumento(v: string, tipo: TipoPessoa) {
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
  if (calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) !== Number(c[12])) return false;
  return calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(c[13]);
}

function validarDocumento(v: string, tipo: TipoPessoa) {
  return tipo === "fisica" ? validarCPF(v) : validarCNPJ(v);
}

function somarDias(dataInicioISO: string, dias: number): string {
  const d = new Date(dataInicioISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Data de término que vai no contrato: em vigência maior que 30 dias, tira 30 pra
 * sobrar prazo de renovar ou aditivar. Em contrato curto, usa a vigência cheia.
 */
function calcularDataTermino(dataInicioISO: string, vigenciaDias: number): string {
  const diasEfetivos = vigenciaDias > 30 ? vigenciaDias - 30 : vigenciaDias;
  return somarDias(dataInicioISO, diasEfetivos);
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

interface FormValues {
  tipoPessoa: TipoPessoa;
  nome: string;
  documento: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  objetoContrato: string;
  detalhesServico: string;
  valorNegociado: number | null;
  condicoes: string;
  vigenciaDias: string;
  dataInicio: string;
  emailContratante: string;
  emailContratado: string;
  testemunha1Nome: string;
  testemunha1Email: string;
  testemunha2Nome: string;
  testemunha2Email: string;
}

function valoresIniciais(n: Negociacao | null): FormValues {
  if (!n) {
    return {
      tipoPessoa: "juridica",
      nome: "",
      documento: "",
      nacionalidade: "",
      estadoCivil: "",
      profissao: "",
      cep: "",
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      estado: "",
      objetoContrato: "",
      detalhesServico: "",
      valorNegociado: null,
      condicoes: "",
      vigenciaDias: "",
      dataInicio: "",
      emailContratante: "",
      emailContratado: "",
      testemunha1Nome: "",
      testemunha1Email: "",
      testemunha2Nome: "",
      testemunha2Email: "",
    };
  }
  return {
    tipoPessoa: n.tipo_pessoa,
    nome: n.fornecedor_nome,
    documento: formatDocumento(n.fornecedor_documento, n.tipo_pessoa),
    nacionalidade: n.fornecedor_nacionalidade ?? "",
    estadoCivil: n.fornecedor_estado_civil ?? "",
    profissao: n.fornecedor_profissao ?? "",
    cep: n.fornecedor_cep ?? "",
    logradouro: n.fornecedor_logradouro ?? "",
    numero: n.fornecedor_numero ?? "",
    complemento: n.fornecedor_complemento ?? "",
    bairro: n.fornecedor_bairro ?? "",
    cidade: n.fornecedor_cidade ?? "",
    estado: n.fornecedor_estado ?? "",
    objetoContrato: n.objeto_contrato ?? "",
    detalhesServico: n.detalhes_servico ?? "",
    valorNegociado: n.valor_negociado,
    condicoes: n.condicoes ?? "",
    vigenciaDias: n.vigencia_dias != null ? String(n.vigencia_dias) : "",
    dataInicio: n.data_inicio ?? "",
    emailContratante: n.email_contratante ?? "",
    emailContratado: n.email_contratado ?? "",
    testemunha1Nome: n.testemunha_1_nome ?? "",
    testemunha1Email: n.testemunha_1_email ?? "",
    testemunha2Nome: n.testemunha_2_nome ?? "",
    testemunha2Email: n.testemunha_2_email ?? "",
  };
}

export function valuesParaLinhaDb(v: FormValues, dataTermino: string | null) {
  return {
    tipo_pessoa: v.tipoPessoa,
    fornecedor_nome: v.nome,
    fornecedor_documento: onlyDigits(v.documento),
    fornecedor_nacionalidade: v.tipoPessoa === "fisica" ? v.nacionalidade || null : null,
    fornecedor_estado_civil: v.tipoPessoa === "fisica" ? v.estadoCivil || null : null,
    fornecedor_profissao: v.tipoPessoa === "fisica" ? v.profissao || null : null,
    fornecedor_cep: v.cep || null,
    fornecedor_logradouro: v.logradouro || null,
    fornecedor_numero: v.numero || null,
    fornecedor_complemento: v.complemento || null,
    fornecedor_bairro: v.bairro || null,
    fornecedor_cidade: v.cidade || null,
    fornecedor_estado: v.estado || null,
    objeto_contrato: v.objetoContrato || null,
    detalhes_servico: v.detalhesServico || null,
    valor_negociado: v.valorNegociado,
    condicoes: v.condicoes || null,
    vigencia_dias: v.vigenciaDias ? Number(v.vigenciaDias) : null,
    data_inicio: v.dataInicio || null,
    data_termino: dataTermino,
    email_contratante: v.emailContratante || null,
    email_contratado: v.emailContratado || null,
    testemunha_1_nome: v.testemunha1Nome || null,
    testemunha_1_email: v.testemunha1Email || null,
    testemunha_2_nome: v.testemunha2Nome || null,
    testemunha_2_email: v.testemunha2Email || null,
  };
}

function FornecedorForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
}: {
  initial: Negociacao | null;
  onSubmit: (dados: Record<string, unknown>) => void;
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  const [v, setV] = React.useState<FormValues>(() => valoresIniciais(initial));
  const [buscandoCep, setBuscandoCep] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((prev) => ({ ...prev, [k]: val }));

  const dataTermino = v.dataInicio && v.vigenciaDias ? calcularDataTermino(v.dataInicio, Number(v.vigenciaDias)) : null;

  const buscarCep = async () => {
    const digits = onlyDigits(v.cep);
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

  const tentarSubmeter = () => {
    if (!validarDocumento(v.documento, v.tipoPessoa)) {
      setErro(v.tipoPessoa === "fisica" ? "CPF inválido." : "CNPJ inválido.");
      return;
    }
    setErro(null);
    onSubmit(valuesParaLinhaDb(v, dataTermino));
  };

  return (
    <div className="rounded-xl border p-4 space-y-3 bg-card">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={v.tipoPessoa === "juridica" ? "default" : "outline"}
          className={v.tipoPessoa === "juridica" ? "bg-primary text-primary-foreground" : ""}
          onClick={() => set("tipoPessoa", "juridica")}
        >
          <Building2 className="size-3.5 mr-1" /> Pessoa Jurídica
        </Button>
        <Button
          type="button"
          size="sm"
          variant={v.tipoPessoa === "fisica" ? "default" : "outline"}
          className={v.tipoPessoa === "fisica" ? "bg-primary text-primary-foreground" : ""}
          onClick={() => set("tipoPessoa", "fisica")}
        >
          <User className="size-3.5 mr-1" /> Pessoa Física
        </Button>
      </div>

      <Input
        placeholder={v.tipoPessoa === "fisica" ? "Nome completo" : "Razão social"}
        value={v.nome}
        onChange={(e) => set("nome", e.target.value)}
        className="h-9"
      />
      <Input
        placeholder={v.tipoPessoa === "fisica" ? "CPF" : "CNPJ"}
        value={v.documento}
        onChange={(e) => set("documento", formatDocumento(e.target.value, v.tipoPessoa))}
        className="h-9"
      />

      {v.tipoPessoa === "fisica" && (
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="Nacionalidade" value={v.nacionalidade} onChange={(e) => set("nacionalidade", e.target.value)} className="h-9" />
          <Input placeholder="Estado civil" value={v.estadoCivil} onChange={(e) => set("estadoCivil", e.target.value)} className="h-9" />
          <Input placeholder="Profissão" value={v.profissao} onChange={(e) => set("profissao", e.target.value)} className="h-9" />
        </div>
      )}

      <div className="flex gap-2">
        <Input placeholder="CEP" value={v.cep} onChange={(e) => set("cep", e.target.value)} onBlur={buscarCep} className="h-9 w-32" />
        <Button type="button" size="sm" variant="outline" disabled={buscandoCep} onClick={buscarCep}>
          {buscandoCep ? "Buscando…" : "Buscar CEP"}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Logradouro" value={v.logradouro} onChange={(e) => set("logradouro", e.target.value)} className="h-9" />
        <Input placeholder="Bairro" value={v.bairro} onChange={(e) => set("bairro", e.target.value)} className="h-9" />
        <Input placeholder="Cidade" value={v.cidade} onChange={(e) => set("cidade", e.target.value)} className="h-9" />
        <Input placeholder="Estado" value={v.estado} onChange={(e) => set("estado", e.target.value)} className="h-9" />
        <Input placeholder="Número" value={v.numero} onChange={(e) => set("numero", e.target.value)} className="h-9" />
        <Input placeholder="Complemento" value={v.complemento} onChange={(e) => set("complemento", e.target.value)} className="h-9" />
      </div>

      <Textarea placeholder="Objeto do contrato" value={v.objetoContrato} onChange={(e) => set("objetoContrato", e.target.value)} className="min-h-16" />
      <Textarea placeholder="Detalhes do serviço" value={v.detalhesServico} onChange={(e) => set("detalhesServico", e.target.value)} className="min-h-16" />

      <CurrencyInput valueReais={v.valorNegociado} onChangeReais={(n) => set("valorNegociado", n)} placeholder="Valor negociado" className="h-9" />
      <Textarea placeholder="Condições (pagamento, parcelamento, etc)" value={v.condicoes} onChange={(e) => set("condicoes", e.target.value)} className="min-h-16" />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[12px] text-muted-foreground">Data de início</label>
          <Input type="date" value={v.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} className="h-9" />
        </div>
        <div>
          <label className="text-[12px] text-muted-foreground">Vigência (dias)</label>
          <Input type="number" placeholder="Ex: 180" value={v.vigenciaDias} onChange={(e) => set("vigenciaDias", e.target.value)} className="h-9" />
        </div>
      </div>
      {dataTermino && (
        <p className="text-[12px] text-muted-foreground">
          Data de término no contrato
          {Number(v.vigenciaDias) > 30 ? " (já com os 30 dias de antecedência pra renovação)" : " (vigência curta, sem os 30 dias de antecedência)"}:{" "}
          <strong>{new Date(dataTermino + "T00:00:00").toLocaleDateString("pt-BR")}</strong>
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="E-mail de assinatura · Contratante" value={v.emailContratante} onChange={(e) => set("emailContratante", e.target.value)} className="h-9" />
        <Input placeholder="E-mail de assinatura · Contratado" value={v.emailContratado} onChange={(e) => set("emailContratado", e.target.value)} className="h-9" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Testemunha 1 · Nome" value={v.testemunha1Nome} onChange={(e) => set("testemunha1Nome", e.target.value)} className="h-9" />
        <Input placeholder="Testemunha 1 · E-mail" value={v.testemunha1Email} onChange={(e) => set("testemunha1Email", e.target.value)} className="h-9" />
        <Input placeholder="Testemunha 2 · Nome" value={v.testemunha2Nome} onChange={(e) => set("testemunha2Nome", e.target.value)} className="h-9" />
        <Input placeholder="Testemunha 2 · E-mail" value={v.testemunha2Email} onChange={(e) => set("testemunha2Email", e.target.value)} className="h-9" />
      </div>

      {erro && <p className="text-[12px] text-destructive">{erro}</p>}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" disabled={!v.nome || !v.documento || submitting} onClick={tentarSubmeter} className="bg-primary text-primary-foreground">
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function NegociacaoCard({
  negociacao,
  api,
  onChange,
  somenteLeitura,
}: {
  negociacao: Negociacao;
  api: NegociacaoApi;
  onChange: () => void;
  somenteLeitura: boolean;
}) {
  const [editando, setEditando] = React.useState(false);
  const [escolhendo, setEscolhendo] = React.useState(false);
  const [justificativa, setJustificativa] = React.useState("");

  const editarMut = useMutation({
    mutationFn: async (dados: Record<string, unknown>) => api.atualizar(negociacao.id, dados),
    onSuccess: () => {
      setEditando(false);
      onChange();
    },
  });

  const escolherMut = useMutation({
    mutationFn: async () => api.escolher(negociacao.id, justificativa),
    onSuccess: () => {
      setEscolhendo(false);
      setJustificativa("");
      onChange();
    },
  });

  if (editando) {
    return (
      <FornecedorForm
        initial={negociacao}
        submitLabel="Salvar alterações"
        submitting={editarMut.isPending}
        onCancel={() => setEditando(false)}
        onSubmit={(dados) => editarMut.mutate(dados)}
      />
    );
  }

  const podeEditar = negociacao.status === "participante" && !somenteLeitura;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {negociacao.tipo_pessoa === "fisica" ? <User className="size-3.5 text-muted-foreground" /> : <Building2 className="size-3.5 text-muted-foreground" />}
          <span className="text-sm font-medium">{negociacao.fornecedor_nome}</span>
        </div>
        <StatusBadge status={negociacao.status} />
      </div>
      <p className="text-[12px] text-muted-foreground font-mono">{formatDocumento(negociacao.fornecedor_documento, negociacao.tipo_pessoa)}</p>
      {negociacao.objeto_contrato && <p className="text-[13px]">{negociacao.objeto_contrato}</p>}
      {negociacao.valor_negociado != null && (
        <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
          {negociacao.valor_negociado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>
      )}
      {negociacao.status === "escolhida" && negociacao.justificativa_escolha && (
        <p className="text-[12px] text-muted-foreground italic">Justificativa: {negociacao.justificativa_escolha}</p>
      )}
      {negociacao.status === "descartada" && (
        <p className="text-[12px] text-muted-foreground flex items-center gap-1">
          <Ban className="size-3" /> Não escolhida, mantida no histórico
        </p>
      )}
      {negociacao.status !== "participante" && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Lock className="size-3" /> Cadastro travado, já foi decidido
        </p>
      )}

      {escolhendo && negociacao.status === "participante" ? (
        <div className="space-y-2">
          <Textarea
            placeholder="Justificativa da escolha (protege contra questionamento de compliance: por que essa e não outra)"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            className="min-h-16 text-[13px]"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setEscolhendo(false)}>Cancelar</Button>
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
      ) : (
        <div className="flex gap-2 flex-wrap">
          {podeEditar && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setEditando(true)}>
              <Pencil className="size-3.5 mr-1" /> Editar
            </Button>
          )}
          {podeEditar && (
            <Button size="sm" className="h-8 bg-primary text-primary-foreground" onClick={() => setEscolhendo(true)}>
              <Trophy className="size-3.5 mr-1" /> Escolher esta empresa
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Painel de negociação. A tela que usa esse componente decide como os dados são lidos
 * e gravados (direto no banco, quando a pessoa está logada; ou pelo servidor, quando
 * o acesso é por link com token).
 */
export function PainelNegociacao({
  api,
  queryKey,
  somenteLeitura = false,
}: {
  api: NegociacaoApi;
  queryKey: unknown[];
  somenteLeitura?: boolean;
}) {
  const [criando, setCriando] = React.useState(false);
  const { data: negociacoes = [], isLoading, refetch } = useQuery({ queryKey, queryFn: api.listar });

  const criarMut = useMutation({
    mutationFn: async (dados: Record<string, unknown>) => api.criar(dados),
    onSuccess: () => {
      setCriando(false);
      refetch();
    },
  });

  const jaTemEscolhida = negociacoes.some((n) => n.status === "escolhida");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cadastre as empresas participantes da licitação. Enquanto uma empresa estiver "Participante", os dados podem ser
        editados; depois de escolhida ou descartada, o cadastro fica travado, pra manter o histórico fiel à decisão tomada.
      </p>

      {!somenteLeitura && !jaTemEscolhida && (
        criando ? (
          <FornecedorForm
            initial={null}
            submitLabel="Cadastrar"
            submitting={criarMut.isPending}
            onCancel={() => setCriando(false)}
            onSubmit={(dados) => criarMut.mutate(dados)}
          />
        ) : (
          <Button onClick={() => setCriando(true)} className="h-9 px-4 text-sm bg-primary text-primary-foreground">
            <Plus className="size-4 mr-1" /> Cadastrar empresa participante
          </Button>
        )
      )}

      {jaTemEscolhida && (
        <p className="text-[13px] text-muted-foreground">
          A negociação já foi concluída: uma empresa foi escolhida e as demais ficaram registradas como descartadas.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : negociacoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
      ) : (
        <div className="space-y-3">
          {negociacoes.map((n) => (
            <NegociacaoCard key={n.id} negociacao={n} api={api} onChange={() => refetch()} somenteLeitura={somenteLeitura} />
          ))}
        </div>
      )}
    </div>
  );
}
