// Dinheiro: sempre inteiro em centavos (seção 3.1). Formatação e leitura só na borda.

export type ParseCentsResult = { ok: true; cents: number } | { ok: false; error: string };

// Limite de sanidade: R$ 10.000.000,00 por valor digitado.
export const MAX_CENTS = 1_000_000_000;

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos como moeda brasileira: 123456 -> "R$ 1.234,56". */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("formatCents exige um inteiro em centavos.");
  }
  return brlFormatter.format(cents / 100);
}

/**
 * Converte o que o usuário digitou ("12,50") em centavos.
 *
 * Regras:
 * - vírgula é o separador decimal; aceita 0, 1 ou 2 casas ("12", "12,5", "12,50");
 * - ponto só é aceito como separador de milhar, em grupos de 3 ("1.234,56");
 *   "12.50" é rejeitado em vez de ser adivinhado;
 * - "R$" e espaços são ignorados;
 * - vazio, texto, valor negativo e mais de 2 casas decimais são rejeitados.
 */
export function parseBRLToCents(input: string): ParseCentsResult {
  const text = input.replace(/R\$/gi, "").replace(/\s+/g, "");

  if (text === "") {
    return { ok: false, error: "Informe um valor." };
  }
  if (text.startsWith("-")) {
    return { ok: false, error: "O valor não pode ser negativo." };
  }

  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(text);
  if (!match) {
    return { ok: false, error: "Valor inválido. Use o formato 12,50." };
  }

  const integerPart = (match[1] ?? "").replace(/\./g, "");
  const decimalPart = (match[2] ?? "").padEnd(2, "0");
  const cents = Number(integerPart) * 100 + Number(decimalPart);

  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) {
    return { ok: false, error: "Valor acima do limite permitido." };
  }
  return { ok: true, cents };
}

/** Centavos -> texto para campo de formulário, sem "R$" nem milhar: 123456 -> "1234,56". */
export function centsToInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("centsToInput exige centavos não negativos.");
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
