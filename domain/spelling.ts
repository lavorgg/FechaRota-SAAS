// Escolha da grafia a mostrar quando vários registros têm a mesma chave normalizada
// ("Centro", "centro " e "CENTRO" são o mesmo bairro: seção 4).

/** Inicial maiúscula sem estar toda em maiúsculas (+2) e com acento (+1). */
export function spellingScore(text: string): number {
  const trimmed = text.trim();
  const titleLike = trimmed.charAt(0) === trimmed.charAt(0).toUpperCase() && trimmed !== trimmed.toUpperCase() ? 2 : 0;
  const accented = /[^\u0000-\u007f]/.test(trimmed) ? 1 : 0;
  return titleLike + accented;
}

/** A grafia mais usada; no empate, a mais bem escrita; depois, a primeira em ordem alfabética. */
export function preferredSpelling(spellings: ReadonlyArray<{ text: string; count: number }>): string {
  let best: { text: string; count: number; score: number } | null = null;
  for (const { text, count } of spellings) {
    const candidate = { text: text.trim(), count, score: spellingScore(text) };
    if (
      !best ||
      candidate.count > best.count ||
      (candidate.count === best.count && (candidate.score > best.score || (candidate.score === best.score && candidate.text < best.text)))
    ) {
      best = candidate;
    }
  }
  return best?.text ?? "";
}

/** Conta as grafias de uma lista de textos e devolve a preferida. */
export function preferredOf(texts: ReadonlyArray<string>): string {
  const counts = new Map<string, number>();
  for (const text of texts) counts.set(text.trim(), (counts.get(text.trim()) ?? 0) + 1);
  return preferredSpelling([...counts].map(([text, count]) => ({ text, count })));
}
