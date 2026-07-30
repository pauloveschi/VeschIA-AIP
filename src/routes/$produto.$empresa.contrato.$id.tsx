import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useEmpresa } from "@/lib/empresa";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Sparkles, FileText, Download } from "lucide-react";

export const Route = createFileRoute("/$produto/$empresa/contrato/$id")({
  component: ContratoPage,
});

const inputSchema = z.object({ solicitacaoId: z.string() });

function enderecoCompleto(parts: {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}): string {
  const linha1 = [parts.logradouro, parts.numero].filter(Boolean).join(", ");
  const linha2 = [parts.complemento, parts.bairro].filter(Boolean).join(", ");
  const linha3 = [parts.cidade, parts.estado].filter(Boolean).join(" - ");
  return [linha1, linha2, linha3, parts.cep ? `CEP ${parts.cep}` : null].filter(Boolean).join(", ") || "(endereço não informado)";
}

function montarPrompt(input: {
  contratanteNome: string;
  contratanteCnpj: string | null;
  contratanteEndereco: string;
  contratado: {
    nome: string;
    documento: string;
    tipoPessoa: string;
    nacionalidade: string | null;
    estadoCivil: string | null;
    profissao: string | null;
    endereco: string;
  };
  objetoContrato: string | null;
  detalhesServico: string | null;
  valor: number | null;
  condicoes: string | null;
  dataInicio: string | null;
  dataTermino: string | null;
}): string {
  return `Você é um assistente jurídico que redige minutas de Contrato de Prestação de Serviços em português do Brasil, seguindo EXATAMENTE a estrutura de seções abaixo (não invente seções novas, não remova nenhuma das 6):

CONTRATO DE PRESTAÇÃO DE SERVIÇOS
1. AS PARTES
2. OBJETO
3. PREÇO E PAGAMENTO
4. PRAZO
5. RESCISÃO E MULTA
6. FORO

Preencha cada seção usando os dados reais abaixo, escrevendo o texto contratual completo, formal e correto, sem colchetes nem placeholders. Se algum dado não foi informado, escreva "a definir" no lugar, mas não invente valores, datas, percentuais de multa, ou dados bancários que não foram te passados.

CONTRATANTE: ${input.contratanteNome}, inscrito(a) no CNPJ/CPF sob o nº ${input.contratanteCnpj ?? "a definir"}, com sede/domicílio em ${input.contratanteEndereco}.

CONTRATADO (${input.contratado.tipoPessoa === "fisica" ? "Pessoa Física" : "Pessoa Jurídica"}): ${input.contratado.nome}, inscrito(a) no CPF/CNPJ sob o nº ${input.contratado.documento}${
    input.contratado.tipoPessoa === "fisica"
      ? `, nacionalidade ${input.contratado.nacionalidade ?? "a definir"}, estado civil ${input.contratado.estadoCivil ?? "a definir"}, profissão ${input.contratado.profissao ?? "a definir"}`
      : ""
  }, com sede/domicílio em ${input.contratado.endereco}.

OBJETO DO CONTRATO: ${input.objetoContrato ?? "a definir"}. ${input.detalhesServico ? `Detalhes do serviço: ${input.detalhesServico}.` : ""}

VALOR: R$ ${input.valor != null ? input.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "a definir"} (escreva também por extenso, em português, na seção de Preço e Pagamento).

CONDIÇÕES DE PAGAMENTO INFORMADAS PELO NEGOCIADOR: ${input.condicoes ?? "a definir"}. Se não houver dado bancário específico (PIX/conta), escreva "dados de pagamento a serem informados pelo CONTRATADO".

PRAZO: início em ${input.dataInicio ?? "a definir"}, término em ${input.dataTermino ?? "a definir"}.

RESCISÃO E MULTA: como não foram informados dias de aviso prévio, percentual de multa por descumprimento, ou percentual de multa moratória e juros de mora, escreva essa seção com os termos como "a definir" nesses três pontos específicos, deixando claro no texto que ficam sujeitos a acordo entre as partes.

FORO: como não foi informada a comarca, escreva "a definir" no lugar da comarca.

Ao final, inclua a formalização padrão ("Por estarem de acordo, assinam este documento em 2 (duas) vias de igual teor") e os campos de assinatura: CONTRATANTE, CONTRATADA, TESTEMUNHA CONTRATANTE, TESTEMUNHA CONTRATADA.

Responda APENAS com o texto do contrato, em texto puro (sem markdown, sem asteriscos, sem títulos numerados fora do padrão "1. AS PARTES" etc.), pronto pra ser impresso.`;
}

const gerarMinutaContrato = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gerarPdfSimples } = await import("@/pdf-simples.server");

    const { data: solicitacao, error: eSol } = await supabaseAdmin
      .from("solicitacoes")
      .select("id, numero, titulo, empresa_id")
      .eq("id", data.solicitacaoId)
      .single();
    if (eSol || !solicitacao) throw new Error("Solicitação não encontrada.");

    const { data: empresa, error: eEmp } = await supabaseAdmin
      .from("empresas_clientes")
      .select(
        "nome, cnpj, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado",
      )
      .eq("id", solicitacao.empresa_id)
      .single();
    if (eEmp || !empresa) throw new Error("Empresa cliente não encontrada.");

    const { data: negociacao, error: eNeg } = await supabaseAdmin
      .from("negociacoes")
      .select("*")
      .eq("solicitacao_id", data.solicitacaoId)
      .eq("status", "escolhida")
      .maybeSingle();
    if (eNeg) throw new Error("Erro ao buscar a negociação escolhida.");
    if (!negociacao) throw new Error("Ainda não há uma empresa escolhida na Negociação Comercial dessa solicitação.");

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada no servidor.");

    const prompt = montarPrompt({
      contratanteNome: empresa.nome,
      contratanteCnpj: empresa.cnpj ?? null,
      contratanteEndereco: enderecoCompleto({
        logradouro: empresa.endereco_logradouro,
        numero: empresa.endereco_numero,
        complemento: empresa.endereco_complemento,
        bairro: empresa.endereco_bairro,
        cidade: empresa.endereco_cidade,
        estado: empresa.endereco_estado,
        cep: empresa.endereco_cep,
      }),
      contratado: {
        nome: negociacao.fornecedor_nome,
        documento: negociacao.fornecedor_documento,
        tipoPessoa: negociacao.tipo_pessoa,
        nacionalidade: negociacao.fornecedor_nacionalidade,
        estadoCivil: negociacao.fornecedor_estado_civil,
        profissao: negociacao.fornecedor_profissao,
        endereco: enderecoCompleto({
          logradouro: negociacao.fornecedor_logradouro,
          numero: negociacao.fornecedor_numero,
          complemento: negociacao.fornecedor_complemento,
          bairro: negociacao.fornecedor_bairro,
          cidade: negociacao.fornecedor_cidade,
          estado: negociacao.fornecedor_estado,
          cep: negociacao.fornecedor_cep,
        }),
      },
      objetoContrato: negociacao.objeto_contrato,
      detalhesServico: negociacao.detalhes_servico,
      valor: negociacao.valor_negociado != null ? Number(negociacao.valor_negociado) : null,
      condicoes: negociacao.condicoes,
      dataInicio: negociacao.data_inicio,
      dataTermino: negociacao.data_termino,
    });

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Erro ao chamar o Gemini (${resp.status}): ${errText.slice(0, 300)}`);
    }

    const json: any = await resp.json();
    const textoGerado: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoGerado) throw new Error("O Gemini não retornou texto. Tente novamente.");

    const pdfBytes = gerarPdfSimples("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", textoGerado);

    const nomeArquivo = `minuta-v${Date.now()}.pdf`;
    const caminho = `${data.solicitacaoId}/${nomeArquivo}`;

    const { error: eUpload } = await supabaseAdmin.storage.from("documentos").upload(caminho, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (eUpload) throw new Error(`Erro ao salvar o PDF: ${eUpload.message}`);

    const { error: eDoc } = await supabaseAdmin.from("documentos").insert({
      solicitacao_id: data.solicitacaoId,
      tipo: "minuta_contrato",
      nome_arquivo: nomeArquivo,
      url: caminho,
    });
    if (eDoc) throw new Error(`Erro ao registrar o documento: ${eDoc.message}`);

    const { data: etapas } = await supabaseAdmin
      .from("etapas_execucao")
      .select("id, configuracao_fluxo:configuracao_fluxo_id(nome_etapa)")
      .eq("solicitacao_id", data.solicitacaoId);
    const etapaElaboracao = (etapas ?? []).find((e: any) => e.configuracao_fluxo?.nome_etapa === "Elaboração do Contrato");
    if (etapaElaboracao) {
      await supabaseAdmin
        .from("etapas_execucao")
        .update({ status: "aprovada", decidido_em: new Date().toISOString() })
        .eq("id", (etapaElaboracao as any).id);
    }

    const { data: signed } = await supabaseAdmin.storage.from("documentos").createSignedUrl(caminho, 60 * 60);

    return { texto: textoGerado, url: signed?.signedUrl ?? null, caminho };
  });

const buscarMinutaExistente = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: doc } = await supabaseAdmin
      .from("documentos")
      .select("id, nome_arquivo, url, uploaded_at")
      .eq("solicitacao_id", data.solicitacaoId)
      .eq("tipo", "minuta_contrato")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!doc) return null;

    const { data: signed } = await supabaseAdmin.storage.from("documentos").createSignedUrl(doc.url, 60 * 60);
    return { nomeArquivo: doc.nome_arquivo, url: signed?.signedUrl ?? null, uploadedAt: doc.uploaded_at };
  });

function useMinutaExistente(solicitacaoId: string) {
  return useQuery({
    queryKey: ["minuta-contrato", solicitacaoId],
    queryFn: async () => buscarMinutaExistente({ data: { solicitacaoId } }),
  });
}

function ContratoPage() {
  const { produto, empresa: empresaSlug, id } = Route.useParams();
  useEmpresa();
  const qc = useQueryClient();
  const { data: minuta, isLoading } = useMinutaExistente(id);
  const [textoGerado, setTextoGerado] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const gerarMut = useMutation({
    mutationFn: async () => gerarMinutaContrato({ data: { solicitacaoId: id } }),
    onSuccess: (res) => {
      setTextoGerado(res.texto);
      setErro(null);
      qc.invalidateQueries({ queryKey: ["minuta-contrato", id] });
      qc.invalidateQueries({ queryKey: ["etapas-execucao", id] });
    },
    onError: (e: Error) => setErro(e.message),
  });

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
        <h1 className="text-xl font-semibold">Elaboração do Contrato</h1>
        <p className="text-sm text-muted-foreground">
          Gera a minuta do contrato com IA, a partir dos dados da empresa escolhida na Negociação Comercial. Essa é uma
          primeira versão simples do PDF (sem a formatação do modelo Word ainda); o texto pode ser revisado antes da
          Validação Jurídica.
        </p>

        <Button
          className="h-9 px-4 text-sm bg-primary text-primary-foreground"
          disabled={gerarMut.isPending}
          onClick={() => gerarMut.mutate()}
        >
          <Sparkles className="size-4 mr-1.5" />
          {gerarMut.isPending ? "Gerando com IA…" : minuta ? "Gerar nova versão" : "Gerar minuta com IA"}
        </Button>

        {erro && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
            {erro}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : minuta?.url ? (
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{minuta.nomeArquivo}</p>
                <p className="text-[12px] text-muted-foreground">
                  Gerado em {new Date(minuta.uploadedAt ?? "").toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
            <a href={minuta.url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="h-8">
                <Download className="size-3.5 mr-1" /> Baixar PDF
              </Button>
            </a>
          </div>
        ) : (
          !gerarMut.isPending && <p className="text-sm text-muted-foreground">Nenhuma minuta gerada ainda.</p>
        )}

        {textoGerado && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[12px] text-muted-foreground mb-2">Prévia do texto gerado:</p>
            <pre className="text-[12.5px] whitespace-pre-wrap font-sans leading-relaxed">{textoGerado}</pre>
          </div>
        )}
      </main>
    </div>
  );
}
