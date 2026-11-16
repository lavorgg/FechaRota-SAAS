// Validação de CPF e CNPJ pelo dígito verificador (seção 4, Customer.document).
//
// CNPJ alfanumérico: desde julho de 2026 a Receita Federal emite CNPJ com letras (A-Z) nas
// 12 primeiras posições; os 2 dígitos verificadores continuam numéricos. O cálculo é o mesmo
// módulo 11, usando o valor "código ASCII - 48" de cada caractere, o que mantém os CNPJs
// só com números válidos como sempre foram.

export type DocumentKind = "CPF" | "CNPJ";
export type ValidateDocumentResult =
  | { ok: true; kind: DocumentKind; value: string }
  | { ok: false; error: string };

/** Remove pontuação e espaços e põe em maiúsculas: "12.ABC.345/01DE-35" -> "12ABC34501DE35". */
export function stripDocument(input: string): string {
  return input.replace(/[.\-/\s]/g, "").toUpperCase();
}

export function isValidCPF(input: string): boolean {
  const cpf = stripDocument(input);
  if (!/^\d{11}$/.test(cpf)) return false;
  // Sequências repetidas (000.000.000-00 etc.) passam na conta, mas não são CPFs reais.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = Array.from(cpf, Number);
  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += (digits[i] ?? 0) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** Calcula os 2 dígitos verificadores a partir das 12 primeiras posições do CNPJ. */
export function calcCNPJCheckDigits(base12: string): string {
  const base = stripDocument(base12);
  if (!/^[0-9A-Z]{12}$/.test(base)) {
    throw new Error("A base do CNPJ deve ter 12 caracteres (dígitos ou letras).");
  }
  const checkDigit = (chars: string): number => {
    const weights = CNPJ_WEIGHTS.slice(CNPJ_WEIGHTS.length - chars.length);
    let sum = 0;
    for (let i = 0; i < chars.length; i++) {
      sum += (chars.charCodeAt(i) - 48) * (weights[i] ?? 0);
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = checkDigit(base);
  const second = checkDigit(`${base}${first}`);
  return `${first}${second}`;
}

export function isValidCNPJ(input: string): boolean {
  const cnpj = stripDocument(input);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;
  return calcCNPJCheckDigits(cnpj.slice(0, 12)) === cnpj.slice(12);
}

/** Valida CPF ou CNPJ e devolve o valor sem pontuação, pronto para gravar. */
export function validateDocument(input: string): ValidateDocumentResult {
  const value = stripDocument(input);
  if (value.length === 11) {
    return isValidCPF(value) ? { ok: true, kind: "CPF", value } : { ok: false, error: "CPF inválido." };
  }
  if (value.length === 14) {
    return isValidCNPJ(value) ? { ok: true, kind: "CNPJ", value } : { ok: false, error: "CNPJ inválido." };
  }
  return { ok: false, error: "Informe um CPF (11 dígitos) ou um CNPJ (14 caracteres)." };
}

/** Exibição: "11222333000181" -> "11.222.333/0001-81"; "52998224725" -> "529.982.247-25". */
export function formatDocument(value: string): string {
  const doc = stripDocument(value);
  if (doc.length === 11) {
    return `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`;
  }
  if (doc.length === 14) {
    return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`;
  }
  return value;
}
