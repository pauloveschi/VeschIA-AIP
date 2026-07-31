/**
 * Rotina diária de acompanhamento de contratos.
 *
 * O motor de fluxo reage a eventos (alguém aprovou, negociação fechou). Mas Execução,
 * Monitoramento e Renovação não dependem de evento nenhum: dependem do tempo passar.
 * É isso que essa rotina resolve, rodando uma vez por dia:
 *
 *   - contrato chegou na data de término → encerra Execução e Monitoramento, ativa a
 *     etapa de Renovação ou Encerramento e deixa o motor avisar o Gestor
 *   - contrato longo se aproximando do fim → manda um alerta prévio, 90 dias antes
 *
 * Cada aviso fica marcado no contrato, então rodar a rotina duas vezes no mesmo dia
 * não gera e-mail repetido.
 */

const DIAS_ALERTA_PREVIO = 90;

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function diasEntre(deISO: string, ateISO: string): number {
  const de = new Date(deISO + "T00:00:00").getTime();
  const ate = new Date(ateISO + "T00:00:00").getTime();
  return Math.round((ate - de) / (24 * 60 * 60 * 1000));
}

function subtrairDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO + "T00:00:00");
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Manda um e-mail simples de aviso, sem link de decisão. */
async function enviarAvisoSimples(
  para: string,
  assunto: string,
  tituloInterno: string,
  corpoHtml: string,
): Promise<boolean> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return false;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #16233a; line-height: 1.55;">
      <p style="font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #6b7a90; margin: 0 0 4px;">
        VeschIA AIP
      </p>
      <h2 style="margin: 0 0 14px; font-size: 18px;">${tituloInterno}</h2>
      ${corpoHtml}
    </div>
  `;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "VeschIA AIP <onboarding@resend.dev>",
      to: [para],
      subject: assunto,
      html,
    }),
  });

  return resp.ok;
}

/** Acha o e-mail do papel Gestor de uma empresa. */
async function emailDoGestor(admin: any, empresaId: string): Promise<string | null> {
  const { data } = await admin
    .from("papeis_empresa")
    .select("email")
    .eq("empresa_id", empresaId)
    .eq("nome", "Gestor")
    .maybeSingle();
  return data?.email ?? null;
}

function formatarData(dataISO: string): string {
  return new Date(dataISO + "T00:00:00").toLocaleDateString("pt-BR");
}

function formatarValor(valor: unknown): string {
  const n = valor != null ? Number(valor) : null;
  return n != null ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "valor não informado";
}

export interface ResultadoRotina {
  processados: number;
  renovacoesAtivadas: string[];
  alertasPrevios: string[];
  erros: string[];
}

/**
 * Passa por todos os contratos ativos e faz o que a data manda.
 * Seguro pra rodar quantas vezes for: cada ação verifica antes se já foi feita.
 */
export async function rodarRotinaDiaria(admin: any): Promise<ResultadoRotina> {
  const resultado: ResultadoRotina = { processados: 0, renovacoesAtivadas: [], alertasPrevios: [], erros: [] };
  const hoje = hojeISO();

  const { data: contratos, error } = await admin
    .from("contratos")
    .select("id, numero, titulo, empresa_id, solicitacao_id, valor, data_inicio, data_termino, status, alerta_previo_enviado_em, renovacao_ativada_em")
    .eq("status", "ativo");

  if (error) {
    resultado.erros.push(`Erro ao listar contratos: ${error.message}`);
    return resultado;
  }

  for (const contrato of contratos ?? []) {
    resultado.processados++;
    const identificacao = `#${contrato.numero} · ${contrato.titulo}`;

    try {
      if (!contrato.data_termino) continue;

      const diasRestantes = diasEntre(hoje, contrato.data_termino);

      // 1. Chegou a hora de decidir renovação ou encerramento
      if (diasRestantes <= 0 && !contrato.renovacao_ativada_em) {
        if (!contrato.solicitacao_id) {
          resultado.erros.push(`${identificacao}: contrato sem solicitação vinculada.`);
          continue;
        }

        // Execução e Monitoramento acompanham o contrato enquanto ele vige.
        // Chegando ao fim, elas se encerram e a decisão de renovar entra em cena.
        const { data: etapas } = await admin
          .from("etapas_execucao")
          .select("id, status, configuracao_fluxo:configuracao_fluxo_id(nome_etapa)")
          .eq("solicitacao_id", contrato.solicitacao_id);

        for (const etapa of (etapas ?? []) as any[]) {
          const nome = etapa.configuracao_fluxo?.nome_etapa;
          if ((nome === "Execução" || nome === "Monitoramento") && etapa.status === "pendente") {
            await admin
              .from("etapas_execucao")
              .update({ status: "aprovada", decidido_em: new Date().toISOString() })
              .eq("id", etapa.id);
          }
        }

        await admin
          .from("contratos")
          .update({ renovacao_ativada_em: new Date().toISOString(), status: "em_renovacao" })
          .eq("id", contrato.id);

        // O motor assume daqui: a próxima etapa é a decisão do Gestor, e ele avisa.
        const { avancarFluxo } = await import("./motor.server");
        await avancarFluxo(admin, contrato.solicitacao_id);

        resultado.renovacoesAtivadas.push(identificacao);
        continue;
      }

      // 2. Alerta prévio, só quando faz sentido: em contrato curto, os 90 dias
      //    cairiam antes do início, então nem existe janela pra avisar.
      if (!contrato.alerta_previo_enviado_em && contrato.data_inicio) {
        const dataAlerta = subtrairDias(contrato.data_termino, DIAS_ALERTA_PREVIO);
        const janelaFazSentido = diasEntre(contrato.data_inicio, dataAlerta) > 0;

        if (janelaFazSentido && diasEntre(hoje, dataAlerta) <= 0 && diasRestantes > 0) {
          const email = await emailDoGestor(admin, contrato.empresa_id);
          if (email) {
            const corpo = `
              <p style="margin: 0 0 14px;">O contrato abaixo se aproxima do fim da vigência.</p>
              <table style="border-collapse: collapse; margin: 0 0 18px;">
                <tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Contrato</td><td style="padding: 3px 0;">${identificacao}</td></tr>
                <tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Valor</td><td style="padding: 3px 0;">${formatarValor(contrato.valor)}</td></tr>
                <tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Término</td><td style="padding: 3px 0;"><strong>${formatarData(contrato.data_termino)}</strong></td></tr>
                <tr><td style="padding: 3px 14px 3px 0; color: #6b7a90;">Faltam</td><td style="padding: 3px 0;">${diasRestantes} dias</td></tr>
              </table>
              <p style="margin: 0; font-size: 12px; color: #6b7a90;">
                Este é apenas um aviso antecipado. Quando chegar a data de término, o sistema abre a etapa de
                renovação ou encerramento e manda um novo e-mail pra você decidir.
              </p>
            `;
            const ok = await enviarAvisoSimples(
              email,
              `Contrato ${identificacao} vence em ${diasRestantes} dias`,
              "Aviso: contrato se aproximando do fim",
              corpo,
            );
            if (ok) {
              await admin
                .from("contratos")
                .update({ alerta_previo_enviado_em: new Date().toISOString() })
                .eq("id", contrato.id);
              resultado.alertasPrevios.push(identificacao);
            }
          }
        }
      }
    } catch (e) {
      resultado.erros.push(`${identificacao}: ${(e as Error).message}`);
    }
  }

  return resultado;
}
