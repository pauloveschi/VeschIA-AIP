import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converte um valor digitado em formato brasileiro (ex: "48.000,00" ou "48000,00"
 * ou só "48000") pra number. Sem isso, um simples replace(",",".") quebra quando
 * tem ponto de milhar (vira "48.000.00", que o JS não consegue converter).
 */
export function parseValorBRL(valor: string): number | null {
  const limpo = valor.trim();
  if (!limpo) return null;
  const semMilhar = limpo.replace(/\./g, "").replace(",", ".");
  const numero = Number(semMilhar);
  return Number.isFinite(numero) ? numero : null;
}
