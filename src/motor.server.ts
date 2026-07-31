/**
 * Motor de execução do fluxo.
 *
 * A ideia: ninguém deveria precisar clicar pra o processo andar. Sempre que o estado
 * de uma solicitação muda (foi criada, alguém aprovou, a negociação fechou), esse motor
 * é chamado e empurra o fluxo o quanto der:
 *
 *   - etapa de sistema  → executa a ação e segue pra próxima
 *   - etapa de papel    → manda o aviso por e-mail (uma vez só) e para, esperando a pessoa
 *   - etapa rejeitada   → aplica a regra de rejeição e encerra o avanço
 *
 * Etapas de acompanhamento contínuo (Execução, Monitoramento) não são "concluídas":
 * o motor para nelas, porque quem as encerra é o passar do tempo, não um evento.
 */

const ETAPAS_CONTINUAS = ["Execução", "Monitoramento"];

/**
 * Etapas em que a pessoa não decide "sim ou não": ela precisa entrar no sistema e
 * produzir alguma coisa (cadastrar fornecedores, escolher proposta). Nessas, o e-mail
 * leva pra tela de trabalho dentro do sistema, não pra tela de aprovação por token,
 * senão daria pra "aprovar" uma etapa sem ter feito o trabalho dela.
 */
const ETAPAS_DE_TRABALHO: Record<string, string> = {
  "Negociação Comercial": "negociacao",
};

/**
 * Etapas que são uma decisão (via token, sem login), mas não cabem no par genérico
 * Aprovar/Rejeitar da tela `/aprovacao/$token`: os dois caminhos têm nomes e
 * consequências diferentes de "aprovado/rejeitado". Cada uma tem sua própria tela.
 */
const ETAPAS_DECISAO_CUSTOMIZADA: Record<string, string> = {
  "Renovação ou Encerramento": "renovacao",
  "Validação Jurídica": "juridico",
};

interface EtapaCarregada {
  id: string;
  status: string;
  papel_resolvido_id: string | null;
  ordem: number;
  nome_etapa: string;
  responsavel_tipo: string;
  obrigatoria: boolean;
  papel_id: string | null;
}

async function carregarEtapas(admin: any, solicitacaoId: string): Promise<EtapaCarregada[]> {
  const { data } = await admin
    .from("etapas_execucao")
    .select(
      "id, status, papel_resolvido_id, configuracao_fluxo:configuracao_fluxo_id(ordem, nome_etapa, responsavel_tipo, obrigatoria, papel_id)",
    )
    .eq("solicitacao_id", solicitacaoId);

  return ((data ?? []) as any[])
    .map((e) => ({
      id: e.id,
      status: e.status,
      papel_resolvido_id: e.papel_resolvido_id,
      ordem: e.configuracao_fluxo?.ordem ?? 0,
      nome_etapa: e.configuracao_fluxo?.nome_etapa ?? "",
      responsavel_tipo: e.configuracao_fluxo?.responsavel_tipo ?? "sistema",
      obrigatoria: e.configuracao_fluxo?.obrigatoria ?? true,
      papel_id: e.configuracao_fluxo?.papel_id ?? null,
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

async function marcarEtapa(admin: any, etapaId: string, status: "aprovada" | "rejeitada") {
  await admin
    .from("etapas_execucao")
    .update({ status, decidido_em: new Date().toISOString() })
    .eq("id", etapaId)
    .eq("status", "pendente");
}

/** Deriva o status da solicitação a partir de onde o fluxo está. */
function calcularStatusSolicitacao(etapas: EtapaCarregada[]): string {
  if (etapas.some((e) => e.status === "rejeitada")) return "rejeitada";

  const resolvida = (nome: string) => {
    const st = etapas.find((e) => e.nome_etapa === nome)?.status;
    return st === "aprovada" || st === "pulada";
  };

  if (resolvida("Encerramento") || resolvida("Renovação ou Encerramento")) return "encerrada";
  if (resolvida("Assinatura")) return "assinada";
  if (resolvida("Aprovação Interna") || resolvida("Aprovação")) return "aprovada";
  if (etapas.some((e) => e.nome_etapa.startsWith("Análise") && (e.status === "aprovada" || e.status === "pulada"))) return "em_analise";
  return "aberta";
}

async function atualizarStatusSolicitacao(admin: any, solicitacaoId: string, etapas: EtapaCarregada[]) {
  const novo = calcularStatusSolicitacao(etapas);
  await admin.from("solicitacoes").update({ status: novo }).eq("id", solicitacaoId);
  return novo;
}

/** Manda o aviso por e-mail pro papel responsável, se ainda não mandou pra essa etapa. */
async function avisarResponsavel(admin: any, etapa: EtapaCarregada, solicitacaoId: string): Promise<string | null> {
  const { count } = await admin
    .from("aprovacao_tokens")
    .select("id", { count: "exact", head: true })
    .eq("etapa_execucao_id", etapa.id);
  if ((count ?? 0) > 0) return null; // já foi avisado sobre essa etapa

  const papelId = etapa.papel_resolvido_id ?? etapa.papel_id;
  if (!papelId) return null;

  const { data: papel } = await admin.from("papeis_empresa").select("nome, email").eq("id", papelId).single();
  if (!papel?.email) return null;

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return null;

  const { data: solicitacao } = await admin
    .from("solicitacoes")
    .select("numero, titulo, valor, fornecedor_nome, empresa_id")
    .eq("id", solicitacaoId)
    .single();

  const { data: empresa } = await admin
    .from("empresas_clientes")
    .select("nome")
    .eq("id", solicitacao?.empresa_id ?? "")
    .maybeSingle();

  const base = process.env.APP_BASE_URL || "https://veschia-aip.vercel.app";
  const rotaTrabalho = ETAPAS_DE_TRABALHO[etapa.nome_etapa];
  const eTrabalho = !!rotaTrabalho;
  const rotaCustomizada = ETAPAS_DECISAO_CUSTOMIZADA[etapa.nome_etapa];

  let link: string;

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  // Etapa de trabalho vale mais tempo: a pessoa pode voltar várias vezes até concluir.
  const diasValidade = eTrabalho ? 30 : 7;
  const expiraEm = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toISOString();

  const { error: eToken } = await admin.from("aprovacao_tokens").insert({
    token,
    etapa_execucao_id: etapa.id,
    enviado_para: papel.email,
    expira_em: expiraEm,
    tipo: eTrabalho ? "trabalho" : "decisao",
  });
  if (eToken) return null;

  link = eTrabalho
    ? `${base}/${rotaTrabalho}-externa/${token}`
    : rotaCustomizada
      ? `${base}/${rotaCustomizada}/${token}`
      : `${base}/aprovacao/${token}`;

  const valorFmt =
    solicitacao?.valor != null
      ? Number(solicitacao.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #16233a; line-height: 1.55;">
      <p style="font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #6b7a90; margin: 0 0 4px;">
        VeschIA AIP · ${empresa?.nome ?? ""}
      </p>
      <h2 style="margin: 0 0 14px; font-size: 18px;">${etapa.nome_etapa}: ${eTrabalho ? "sua ação é necessária" : "sua decisão foi solicitada"}</h2>
      <p style="margin: 0 0 6px;">Olá, ${papel.nome}.</p>
      <p style="margin: 0 0 14px;">${eTrabalho ? "A solicitação abaixo está esperando você trabalhar nela:" : "A solicitação abaixo está aguardando você:"}</p>
      <table style="border-collapse: collapse; margin: 0 0 18px;">
        <tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Solicitação</td><td style="padding: 3px 0;">#${solicitacao?.numero} · ${solicitacao?.titulo ?? ""}</td></tr>
        ${solicitacao?.fornecedor_nome ? `<tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Fornecedor</td><td style="padding: 3px 0;">${solicitacao.fornecedor_nome}</td></tr>` : ""}
        ${valorFmt ? `<tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Valor</td><td style="padding: 3px 0; font-weight: bold;">${valorFmt}</td></tr>` : ""}
      </table>
      <p style="margin: 0 0 18px;">
        <a href="${link}" style="display: inline-block; background: #16233a; color: #ffffff; text-decoration: none; padding: 11px 22px; border-radius: 6px;">
          ${eTrabalho ? "Abrir no sistema" : "Abrir e decidir"}
        </a>
      </p>
      <p style="margin: 0 0 4px; font-size: 12px; color: #6b7a90;">Ou copie este endereço no navegador:</p>
      <p style="margin: 0 0 18px; font-size: 12px;"><a href="${link}" style="color: #1a73e8;">${link}</a></p>
      <p style="margin: 0; font-size: 12px; color: #6b7a90;">
        ${eTrabalho
          ? "O link abre a tela onde você cadastra as empresas e escolhe uma. Válido por 30 dias, e pode ser aberto quantas vezes precisar."
          : rotaCustomizada === "renovacao"
            ? "O link abre uma tela com os detalhes, onde você escolhe entre renovar ou encerrar o contrato. Válido por 7 dias e por um único uso."
            : rotaCustomizada === "juridico"
              ? "O link abre uma tela com a minuta, onde você aprova ou pede um ajuste. Válido por 7 dias e por um único uso."
              : "O link abre uma tela com os detalhes, onde você aprova ou rejeita. Válido por 7 dias e por um único uso."}
      </p>
    </div>
  `;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "VeschIA AIP <onboarding@resend.dev>",
      to: [papel.email],
      subject: `${etapa.nome_etapa}: solicitação #${solicitacao?.numero} aguarda ${eTrabalho ? "sua ação" : "sua decisão"}`,
      html,
    }),
  });

  if (!resp.ok) return null;
  return papel.email;
}

interface FaixaValor {
  valor_max: number | null;
  aprovadores: string[];
}

interface CondicaoAprovacaoPorValor {
  tipo: "aprovacao_por_valor";
  faixas: FaixaValor[];
  aprovador_extra_se_papel_existir?: string;
}

/** Decide quais papéis aprovam, dada a condição de faixa e o valor da solicitação. */
function papeisDaFaixa(
  condicao: CondicaoAprovacaoPorValor,
  valor: number,
  papeis: { id: string; nome: string }[],
): string[] {
  const faixa =
    condicao.faixas.find((f) => f.valor_max != null && valor <= f.valor_max) ??
    condicao.faixas.find((f) => f.valor_max == null) ??
    condicao.faixas[0];

  const nomes = new Set(faixa?.aprovadores ?? []);
  const extra = condicao.aprovador_extra_se_papel_existir;
  if (extra && papeis.some((p) => p.nome === extra)) nomes.add(extra);

  return Array.from(nomes)
    .map((nome) => papeis.find((p) => p.nome === nome)?.id)
    .filter((id): id is string => !!id);
}

/**
 * Reconcilia as etapas de aprovação que dependem do valor da solicitação.
 *
 * Por que isso existe: as `etapas_execucao` nascem junto com a solicitação, e nesse
 * momento `valor` ainda é null (o valor só é definido lá na Negociação Comercial).
 * Resolver a faixa naquele instante daria sempre a faixa mais baixa, e uma
 * contratação acima da alçada nunca subiria pro Diretor.
 *
 * Então o motor reconcilia sempre que roda: assim que o valor existe, as linhas
 * pendentes passam a refletir a faixa correta. Etapas já decididas nunca são
 * tocadas, e o aprovador delas conta como coberto (o Gestor que já aprovou não
 * precisa aprovar de novo só porque o Diretor entrou na jogada).
 */
async function reconciliarAprovadoresPorValor(admin: any, solicitacaoId: string) {
  const { data: solicitacao } = await admin
    .from("solicitacoes")
    .select("valor, empresa_id, produto")
    .eq("id", solicitacaoId)
    .single();

  // Sem valor definido ainda, não há o que reconciliar: a faixa é indeterminável.
  if (!solicitacao || solicitacao.valor == null) return;
  const valor = Number(solicitacao.valor);

  const { data: configs } = await admin
    .from("configuracao_fluxo")
    .select("id, condicao, responsavel_tipo")
    .eq("empresa_id", solicitacao.empresa_id)
    .eq("produto", solicitacao.produto)
    .eq("ativo", true);

  const configsPorValor = ((configs ?? []) as any[]).filter(
    (c) => c.responsavel_tipo === "papel" && c.condicao?.tipo === "aprovacao_por_valor",
  );
  if (configsPorValor.length === 0) return;

  const { data: papeis } = await admin
    .from("papeis_empresa")
    .select("id, nome")
    .eq("empresa_id", solicitacao.empresa_id);

  for (const config of configsPorValor) {
    const desejados = papeisDaFaixa(config.condicao, valor, (papeis ?? []) as any[]);
    if (desejados.length === 0) continue;

    const { data: existentes } = await admin
      .from("etapas_execucao")
      .select("id, status, papel_resolvido_id")
      .eq("solicitacao_id", solicitacaoId)
      .eq("configuracao_fluxo_id", config.id);

    const linhas = (existentes ?? []) as any[];
    const decididas = linhas.filter((l) => l.status !== "pendente");
    const pendentes = linhas.filter((l) => l.status === "pendente");

    // Quem já decidiu está coberto e não volta pra fila.
    const cobertos = new Set(decididas.map((l) => l.papel_resolvido_id).filter(Boolean));

    // Tira da fila quem não faz parte da faixa (ex: linha sem papel resolvido,
    // criada quando o valor ainda era desconhecido).
    const sobrando = pendentes.filter(
      (l) => !l.papel_resolvido_id || !desejados.includes(l.papel_resolvido_id),
    );
    for (const linha of sobrando) {
      await admin.from("etapas_execucao").delete().eq("id", linha.id).eq("status", "pendente");
    }

    const jaNaFila = new Set(
      pendentes
        .filter((l) => l.papel_resolvido_id && desejados.includes(l.papel_resolvido_id))
        .map((l) => l.papel_resolvido_id),
    );

    const faltando = desejados.filter((papelId) => !jaNaFila.has(papelId) && !cobertos.has(papelId));
    if (faltando.length > 0) {
      await admin.from("etapas_execucao").insert(
        faltando.map((papelId) => ({
          solicitacao_id: solicitacaoId,
          configuracao_fluxo_id: config.id,
          papel_resolvido_id: papelId,
        })),
      );
    }
  }
}

/** Cria o registro definitivo do contrato a partir da negociação escolhida. */
async function executarCadastroContrato(admin: any, solicitacaoId: string) {
  const { data: jaExiste } = await admin
    .from("contratos")
    .select("id")
    .eq("solicitacao_id", solicitacaoId)
    .maybeSingle();
  if (jaExiste) return;

  const { data: solicitacao } = await admin
    .from("solicitacoes")
    .select("titulo, centro_custo, empresa_id")
    .eq("id", solicitacaoId)
    .single();
  if (!solicitacao) throw new Error("Solicitação não encontrada.");

  const { data: negociacao } = await admin
    .from("negociacoes")
    .select("*")
    .eq("solicitacao_id", solicitacaoId)
    .eq("status", "escolhida")
    .maybeSingle();
  if (!negociacao) throw new Error("Não há negociação escolhida pra cadastrar o contrato.");

  const { data: ultimo } = await admin
    .from("contratos")
    .select("numero")
    .eq("empresa_id", solicitacao.empresa_id)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("contratos").insert({
    empresa_id: solicitacao.empresa_id,
    solicitacao_id: solicitacaoId,
    numero: (ultimo?.numero ?? 0) + 1,
    titulo: solicitacao.titulo,
    objeto: negociacao.objeto_contrato,
    centro_custo: solicitacao.centro_custo,
    fornecedor_nome: negociacao.fornecedor_nome,
    fornecedor_documento: negociacao.fornecedor_documento,
    valor: negociacao.valor_negociado,
    data_inicio: negociacao.data_inicio,
    data_termino: negociacao.data_termino,
    vigencia_dias: negociacao.vigencia_dias,
    status: "ativo",
  });
  if (error) throw new Error(`Erro ao cadastrar o contrato: ${error.message}`);
}

export interface ResultadoMotor {
  parouEm: string | null;
  motivo: "aguardando_pessoa" | "acompanhamento_continuo" | "rejeitada" | "concluida" | "erro";
  executadas: string[];
  avisoEnviadoPara: string | null;
  erro: string | null;
  statusSolicitacao: string;
}

/**
 * Empurra o fluxo da solicitação o quanto for possível sem intervenção humana.
 * Seguro pra chamar várias vezes: cada ação verifica antes se já foi feita.
 */
export async function avancarFluxo(admin: any, solicitacaoId: string): Promise<ResultadoMotor> {
  const executadas: string[] = [];
  let avisoEnviadoPara: string | null = null;

  // Antes de andar, garante que as etapas que dependem do valor estejam com os
  // aprovadores certos. É aqui porque o valor só passa a existir no meio do fluxo.
  await reconciliarAprovadoresPorValor(admin, solicitacaoId);

  // O limite existe só como trava de segurança contra laço infinito.
  for (let volta = 0; volta < 30; volta++) {
    const etapas = await carregarEtapas(admin, solicitacaoId);

    const rejeitada = etapas.find((e) => e.status === "rejeitada");
    if (rejeitada) {
      const status = await atualizarStatusSolicitacao(admin, solicitacaoId, etapas);
      return { parouEm: rejeitada.nome_etapa, motivo: "rejeitada", executadas, avisoEnviadoPara, erro: null, statusSolicitacao: status };
    }

    const proxima = etapas.find((e) => e.status === "pendente");
    if (!proxima) {
      const status = await atualizarStatusSolicitacao(admin, solicitacaoId, etapas);
      return { parouEm: null, motivo: "concluida", executadas, avisoEnviadoPara, erro: null, statusSolicitacao: status };
    }

    // Decisão humana: avisa e para
    if (proxima.responsavel_tipo === "papel" || proxima.responsavel_tipo === "ia") {
      const enviado = await avisarResponsavel(admin, proxima, solicitacaoId);
      if (enviado) avisoEnviadoPara = enviado;
      const status = await atualizarStatusSolicitacao(admin, solicitacaoId, etapas);
      return { parouEm: proxima.nome_etapa, motivo: "aguardando_pessoa", executadas, avisoEnviadoPara, erro: null, statusSolicitacao: status };
    }

    // Acompanhamento contínuo: fica aberta, quem encerra é o tempo
    if (ETAPAS_CONTINUAS.includes(proxima.nome_etapa)) {
      const status = await atualizarStatusSolicitacao(admin, solicitacaoId, etapas);
      return {
        parouEm: proxima.nome_etapa,
        motivo: "acompanhamento_continuo",
        executadas,
        avisoEnviadoPara,
        erro: null,
        statusSolicitacao: status,
      };
    }

    // Etapa automática: executa a ação correspondente
    try {
      if (proxima.nome_etapa === "Elaboração do Contrato") {
        const { data: solicitacaoAtual } = await admin
          .from("solicitacoes")
          .select("ressalva_juridica")
          .eq("id", solicitacaoId)
          .single();

        if (solicitacaoAtual?.ressalva_juridica) {
          // O Jurídico pediu ajuste: gera minuta nova incorporando a ressalva
          // (cláusula, valor, prazo, objeto — qualquer que seja), mesmo já
          // existindo uma minuta anterior. Depois limpa a ressalva consumida.
          const { gerarMinuta } = await import("./minuta.server");
          await gerarMinuta(admin, solicitacaoId, solicitacaoAtual.ressalva_juridica);
          await admin.from("solicitacoes").update({ ressalva_juridica: null }).eq("id", solicitacaoId);
        } else {
          const { data: jaTem } = await admin
            .from("documentos")
            .select("id")
            .eq("solicitacao_id", solicitacaoId)
            .eq("tipo", "minuta_contrato")
            .limit(1)
            .maybeSingle();
          if (!jaTem) {
            const { gerarMinuta } = await import("./minuta.server");
            await gerarMinuta(admin, solicitacaoId);
          }
        }
      } else if (proxima.nome_etapa === "Cadastro do Contrato") {
        await executarCadastroContrato(admin, solicitacaoId);
      }
      // "Solicitação da Contratação", "Assinatura" (simulada por enquanto) e demais
      // etapas automáticas não têm ação própria ainda: só marcam conclusão.

      await marcarEtapa(admin, proxima.id, "aprovada");
      executadas.push(proxima.nome_etapa);
    } catch (e) {
      const etapasAtuais = await carregarEtapas(admin, solicitacaoId);
      const status = await atualizarStatusSolicitacao(admin, solicitacaoId, etapasAtuais);
      return {
        parouEm: proxima.nome_etapa,
        motivo: "erro",
        executadas,
        avisoEnviadoPara,
        erro: (e as Error).message,
        statusSolicitacao: status,
      };
    }
  }

  const etapasFinais = await carregarEtapas(admin, solicitacaoId);
  const status = await atualizarStatusSolicitacao(admin, solicitacaoId, etapasFinais);
  return { parouEm: null, motivo: "erro", executadas, avisoEnviadoPara, erro: "Limite de avanço atingido.", statusSolicitacao: status };
}
