/**
 * Fonte única dos status de solicitação e contrato.
 *
 * Antes essa lista vivia dentro de `$produto.$empresa.index.tsx`, só pra pintar o badge.
 * Agora o menu lateral também precisa dela (pros filtros e contadores), e duas listas
 * paralelas divergiriam na primeira vez que alguém mexesse numa só. Por isso mora aqui.
 *
 * A lista é fixa no código, por decisão: montar o menu a partir do que existe no banco
 * faria ele mudar de tamanho sozinho conforme os dados mudam, e quem já decorou a posição
 * de um item erraria o clique. Status sem nenhum registro aparece com contador 0, que já
 * comunica a mesma coisa sem mexer no menu.
 */

export interface StatusMeta {
  label: string;
  fg: string;
  bg: string;
}

export const statusSolicitacaoMeta: Record<string, StatusMeta> = {
  aberta: { label: "Aberta", fg: "var(--ops-aberta)", bg: "var(--ops-aberta-bg)" },
  em_analise: { label: "Em análise", fg: "var(--ops-em-analise)", bg: "var(--ops-em-analise-bg)" },
  ajuste_solicitado: { label: "Ajuste solicitado", fg: "var(--ops-em-analise)", bg: "var(--ops-em-analise-bg)" },
  aprovada: { label: "Aprovada", fg: "var(--ops-aprovada)", bg: "var(--ops-aprovada-bg)" },
  rejeitada: { label: "Rejeitada", fg: "var(--ops-rejeitada)", bg: "var(--ops-rejeitada-bg)" },
  assinada: { label: "Assinada", fg: "var(--ops-assinada)", bg: "var(--ops-assinada-bg)" },
  encerrada: { label: "Encerrada", fg: "var(--ops-encerrada)", bg: "var(--ops-encerrada-bg)" },
  cancelada: { label: "Cancelada", fg: "var(--ops-cancelada)", bg: "var(--ops-cancelada-bg)" },
};

/** Ordem em que os status aparecem no menu. Segue o caminho natural do fluxo. */
export const STATUS_SOLICITACAO = [
  "aberta",
  "em_analise",
  "ajuste_solicitado",
  "aprovada",
  "rejeitada",
  "assinada",
  "encerrada",
  "cancelada",
] as const;

export const statusContratoMeta: Record<string, StatusMeta> = {
  ativo: { label: "Ativo", fg: "var(--ops-aprovada)", bg: "var(--ops-aprovada-bg)" },
  encerrado: { label: "Encerrado", fg: "var(--ops-encerrada)", bg: "var(--ops-encerrada-bg)" },
};

export const STATUS_CONTRATO = ["ativo", "encerrado"] as const;

/** Conta quantas linhas há por status, incluindo os que não têm nenhuma (viram 0). */
export function contarPorStatus(linhas: { status: string }[], statusConhecidos: readonly string[]) {
  const contagem: Record<string, number> = {};
  for (const s of statusConhecidos) contagem[s] = 0;
  for (const linha of linhas) {
    if (linha.status in contagem) contagem[linha.status] += 1;
  }
  return contagem;
}
