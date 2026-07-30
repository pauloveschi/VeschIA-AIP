/**
 * Gerador de PDF simples, escrito na mão (sem biblioteca externa como pdf-lib),
 * porque adicionar uma dependência nova exigiria rodar `npm install` pra atualizar
 * o package-lock.json corretamente, e não temos ambiente local pra isso.
 *
 * Suporta: título em negrito, parágrafos com quebra de linha automática,
 * detecção simples de "cabeçalho de seção" (ex: "1. OBJETO") pra deixar em negrito,
 * e paginação automática. Fonte Helvetica padrão (sem precisar embutir arquivo de fonte).
 */

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 56;
const FONT_SIZE_BODY = 11;
const FONT_SIZE_TITLE = 15;
const LINE_HEIGHT = 15;
const MAX_CHARS_PER_LINE = 92;
const LINES_PER_PAGE = Math.floor((HEIGHT - 2 * MARGIN) / LINE_HEIGHT);

/** Mapeia caracteres Unicode pra WinAnsiEncoding (que cobre acentuação do português em 1 byte). */
function toWinAnsiString(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 63;
    out += code <= 0xff ? String.fromCharCode(code) : "?";
  }
  return out;
}

function escapePdfLiteral(byteStr: string): string {
  return byteStr.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(" ");
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars) {
      if (current) out.push(current);
      current = w;
    } else {
      current = current ? current + " " + w : w;
    }
  }
  if (current) out.push(current);
  return out;
}

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return /^\d+\.\s/.test(t) || (t === t.toUpperCase() && /[A-ZÀ-Ú]/.test(t) && t.length < 60);
}

interface Linha {
  texto: string;
  negrito: boolean;
}

/** Gera um PDF simples (texto + negrito de título/cabeçalho + paginação automática), sem dependências. */
export function gerarPdfSimples(titulo: string, corpo: string): Uint8Array {
  const linhas: Linha[] = [{ texto: titulo, negrito: true }, { texto: "", negrito: false }];
  for (const p of corpo.split("\n")) {
    if (p.trim() === "") {
      linhas.push({ texto: "", negrito: false });
      continue;
    }
    const negrito = isHeading(p);
    for (const parte of wrapLine(p, MAX_CHARS_PER_LINE)) {
      linhas.push({ texto: parte, negrito });
    }
  }

  const paginas: Linha[][] = [];
  for (let i = 0; i < linhas.length; i += LINES_PER_PAGE) {
    paginas.push(linhas.slice(i, i + LINES_PER_PAGE));
  }
  if (paginas.length === 0) paginas.push([]);

  const numPaginas = paginas.length;
  const OBJ_CATALOG = 1;
  const OBJ_PAGES = 2;
  const OBJ_F1 = 3;
  const OBJ_F2 = 4;
  const firstPageObj = 5;
  const firstContentObj = firstPageObj + numPaginas;
  const totalObjs = firstContentObj + numPaginas - 1;

  const parts: string[] = [];
  const offsets: number[] = new Array(totalObjs + 1).fill(0);
  let pos = 0;
  const push = (s: string) => {
    parts.push(s);
    pos += s.length;
  };

  push("%PDF-1.4\n");

  offsets[OBJ_CATALOG] = pos;
  push(`${OBJ_CATALOG} 0 obj\n<< /Type /Catalog /Pages ${OBJ_PAGES} 0 R >>\nendobj\n`);

  const kids = Array.from({ length: numPaginas }, (_, i) => `${firstPageObj + i} 0 R`).join(" ");
  offsets[OBJ_PAGES] = pos;
  push(`${OBJ_PAGES} 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${numPaginas} >>\nendobj\n`);

  offsets[OBJ_F1] = pos;
  push(`${OBJ_F1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);
  offsets[OBJ_F2] = pos;
  push(`${OBJ_F2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`);

  for (let i = 0; i < numPaginas; i++) {
    const pageObjNum = firstPageObj + i;
    const contentObjNum = firstContentObj + i;

    offsets[pageObjNum] = pos;
    push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent ${OBJ_PAGES} 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] ` +
        `/Resources << /Font << /F1 ${OBJ_F1} 0 R /F2 ${OBJ_F2} 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`,
    );

    let y = HEIGHT - MARGIN;
    let stream = "BT\n";
    for (const linha of paginas[i]) {
      const font = linha.negrito ? "F2" : "F1";
      const size = linha.negrito ? FONT_SIZE_TITLE : FONT_SIZE_BODY;
      const texto = escapePdfLiteral(toWinAnsiString(linha.texto));
      stream += `/${font} ${size} Tf\n1 0 0 1 ${MARGIN} ${y} Tm\n(${texto}) Tj\n`;
      y -= LINE_HEIGHT;
    }
    stream += "ET\n";

    offsets[contentObjNum] = pos;
    push(`${contentObjNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);
  }

  const xrefStart = pos;
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjs; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${totalObjs + 1} /Root ${OBJ_CATALOG} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const full = parts.join("");
  const bytes = new Uint8Array(full.length);
  for (let i = 0; i < full.length; i++) bytes[i] = full.charCodeAt(i) & 0xff;
  return bytes;
}
