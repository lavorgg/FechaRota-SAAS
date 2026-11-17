// Busca sem diferenciar maiúsculas nem acentos (seção 5.5).
//
// O texto pesquisável de cada cliente e produto é guardado já normalizado (coluna searchText).
// A busca quebra o que foi digitado em pedaços e exige TODOS: "pao centro" encontra
// "Padaria Pão Quente, Centro"; "16 99999" encontra o telefone 5516999990001.

const MAX_TOKENS = 8;

/** Minúsculo, sem acento, só letras e números separados por um espaço. */
export function normalizeSearchText(...parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Pedaços da busca, já normalizados. Vazio = sem filtro. */
export function searchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return [...new Set(normalized.split(" "))].slice(0, MAX_TOKENS);
}

export function matchesSearch(searchText: string, tokens: readonly string[]): boolean {
  return tokens.every((token) => searchText.includes(token));
}

export function customerSearchText(customer: {
  name: string;
  legalName?: string | null;
  neighborhood: string;
  city: string;
  document?: string | null;
  phone?: string | null;
}): string {
  return normalizeSearchText(customer.name, customer.legalName, customer.neighborhood, customer.city, customer.document, customer.phone);
}

export function productSearchText(product: { sku: string; name: string }): string {
  return normalizeSearchText(product.sku, product.name);
}
