// Foto do comprovante (seção 5.7): lado maior de 1600 px, JPEG ~0,7, meta de 400 KB.

export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.7;
export const PHOTO_TARGET_BYTES = 400 * 1024;
/** Qualidade mínima antes de reduzir também o tamanho. */
export const PHOTO_MIN_QUALITY = 0.45;

/** Dimensões finais mantendo a proporção, sem aumentar foto pequena. */
export function fitWithin(width: number, height: number, maxSide = PHOTO_MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new Error("Dimensões de foto inválidas.");
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Próxima tentativa quando a foto passou da meta: primeiro baixa a qualidade de 0,1 em 0,1
 * até 0,45; depois reduz o lado maior em 20%. Null = desistir (mantém a última versão).
 */
export function nextCompressionStep(current: { quality: number; maxSide: number }): { quality: number; maxSide: number } | null {
  const lowered = Math.round((current.quality - 0.1) * 100) / 100;
  if (lowered >= PHOTO_MIN_QUALITY) return { quality: lowered, maxSide: current.maxSide };
  const smaller = Math.round(current.maxSide * 0.8);
  if (smaller < 640) return null;
  return { quality: PHOTO_QUALITY, maxSide: smaller };
}
