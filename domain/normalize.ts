// Normalização de texto para agrupamento e busca (seção 4, Customer).

/**
 * Chave de agrupamento: minúsculo, sem acento, sem espaço nas pontas e sem espaço duplicado.
 * "Centro", "centro " e "  CENTRO" viram a mesma chave "centro".
 * "Vila  Tibério" e "vila tiberio" viram "vila tiberio".
 */
export function normalizeKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function onlyDigits(text: string): string {
  return text.replace(/\D/g, "");
}

export type NormalizePhoneResult = { ok: true; phone: string } | { ok: false; error: string };

/**
 * Telefone brasileiro normalizado: só dígitos, com DDI 55 (formato usado em https://wa.me/).
 * Aceita com ou sem DDI: "(16) 99999-0001", "16999990001", "+55 16 3333-0001".
 */
export function normalizePhoneBR(input: string): NormalizePhoneResult {
  let digits = onlyDigits(input);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) {
    return { ok: false, error: "Telefone inválido. Informe DDD e número." };
  }
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11) {
    return { ok: false, error: "DDD inválido." };
  }
  if (digits.length === 11 && digits[2] !== "9") {
    return { ok: false, error: "Celular deve começar com 9 depois do DDD." };
  }
  return { ok: true, phone: `55${digits}` };
}

export const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
export type BrazilianState = (typeof BRAZILIAN_STATES)[number];

export function isBrazilianState(value: string): value is BrazilianState {
  return (BRAZILIAN_STATES as readonly string[]).includes(value);
}
