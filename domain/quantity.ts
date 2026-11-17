// Quantidade: Decimal(10,3) no banco (seção 3.2). No domínio trabalhamos com inteiros em
// milésimos ("2,750 kg" = 2750) para nunca fazer conta de dinheiro com ponto flutuante.

export const PRODUCT_UNITS = ["CX", "DZ", "FD", "KG", "UN", "PCT"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export type ParseQuantityResult = { ok: true; milli: number } | { ok: false; error: string };

// Decimal(10,3) guarda até 9.999.999,999.
export const MAX_QUANTITY_MILLI = 9_999_999_999;

/** Só KG aceita quantidade fracionada. As demais unidades são sempre inteiras. */
export function unitAllowsFraction(unit: ProductUnit): boolean {
  return unit === "KG";
}

/**
 * Converte uma quantidade digitada ("2,750", "2.75", "3") em milésimos.
 * Aceita vírgula ou ponto como separador decimal, com até 3 casas.
 */
export function parseQuantityToMilli(input: string): ParseQuantityResult {
  const text = input.trim();
  if (text === "") {
    return { ok: false, error: "Informe a quantidade." };
  }
  const match = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(text);
  if (!match) {
    return { ok: false, error: "Quantidade inválida. Use até 3 casas decimais." };
  }
  const milli = Number(match[1] ?? "0") * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
  if (!Number.isSafeInteger(milli) || milli > MAX_QUANTITY_MILLI) {
    return { ok: false, error: "Quantidade acima do limite permitido." };
  }
  if (milli <= 0) {
    return { ok: false, error: "A quantidade deve ser maior que zero." };
  }
  return { ok: true, milli };
}

/** Valida a quantidade conforme a unidade: inteira para tudo que não é KG. */
export function validateQuantityForUnit(milli: number, unit: ProductUnit): ParseQuantityResult {
  if (!Number.isSafeInteger(milli) || milli <= 0) {
    return { ok: false, error: "A quantidade deve ser maior que zero." };
  }
  if (milli > MAX_QUANTITY_MILLI) {
    return { ok: false, error: "Quantidade acima do limite permitido." };
  }
  if (!unitAllowsFraction(unit) && milli % 1000 !== 0) {
    return { ok: false, error: `Quantidade em ${unit} deve ser um número inteiro.` };
  }
  return { ok: true, milli };
}

/** Milésimos -> texto decimal com ponto, 3 casas, pronto para o Prisma: 2750 -> "2.750". */
export function milliToDecimalString(milli: number): string {
  if (!Number.isSafeInteger(milli) || milli < 0) {
    throw new Error("milliToDecimalString exige um inteiro não negativo.");
  }
  const whole = Math.floor(milli / 1000);
  const fraction = String(milli % 1000).padStart(3, "0");
  return `${whole}.${fraction}`;
}

/**
 * Texto decimal vindo do banco ("2.750", "3", "0.5") -> milésimos.
 * Rejeita qualquer coisa fora do formato Decimal(10,3) não negativo.
 */
export function decimalStringToMilli(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) {
    throw new Error(`Quantidade em formato inesperado: "${value}".`);
  }
  return Number(match[1] ?? "0") * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
}

/** Exibição em pt-BR: 2750 -> "2,75"; 3000 -> "3"; 2755 -> "2,755". */
export function formatQuantity(milli: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(
    milli / 1000,
  );
}

/**
 * Subtotal de um item = quantidade × preço unitário, em centavos.
 *
 * Regra de arredondamento: meio centavo arredonda para cima (half-up), por item.
 * Exemplo: 2,750 kg × R$ 42,90 = R$ 117,975 -> R$ 117,98.
 * A conta é feita só com inteiros (BigInt), sem ponto flutuante.
 */
export function calcSubtotalCents(quantityMilli: number, unitPriceCents: number): number {
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli < 0) {
    throw new Error("Quantidade inválida para cálculo de subtotal.");
  }
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new Error("Preço inválido para cálculo de subtotal.");
  }
  const raw = BigInt(quantityMilli) * BigInt(unitPriceCents);
  const rounded = (raw + BigInt(500)) / BigInt(1000);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new Error("Subtotal fora do limite suportado.");
  }
  return result;
}

/**
 * Total do pedido = soma dos subtotais já arredondados de cada item.
 * (Arredonda-se por item, não no total, para o total bater com a soma das linhas do romaneio.)
 */
export function calcOrderTotalCents(items: ReadonlyArray<{ quantityMilli: number; unitPriceCents: number }>): number {
  return items.reduce((sum, item) => sum + calcSubtotalCents(item.quantityMilli, item.unitPriceCents), 0);
}

/** Milésimos -> texto para campo de formulário, sem milhar e sem zeros à direita: 2750 -> "2,75". */
export function milliToInput(milli: number): string {
  if (!Number.isSafeInteger(milli) || milli < 0) throw new Error("milliToInput exige um inteiro não negativo.");
  const whole = Math.floor(milli / 1000);
  const fraction = String(milli % 1000).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : String(whole);
}
