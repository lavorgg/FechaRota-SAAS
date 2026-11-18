// Assinatura no canvas (seção 5.7). Só a geometria fica aqui: limites do desenho, recorte e a
// regra que recusa assinatura vazia ou com traço insignificante.

export type Point = { x: number; y: number };
export type Stroke = ReadonlyArray<Point>;
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Tinta mínima (soma do comprimento dos traços, em px CSS) e tamanho mínimo do desenho. */
export const MIN_SIGNATURE_INK = 80;
export const MIN_SIGNATURE_SIZE = 24;

export function strokesBounds(strokes: ReadonlyArray<Stroke>): Bounds | null {
  let bounds: Bounds | null = null;
  for (const stroke of strokes) {
    for (const { x, y } of stroke) {
      bounds = bounds
        ? { minX: Math.min(bounds.minX, x), minY: Math.min(bounds.minY, y), maxX: Math.max(bounds.maxX, x), maxY: Math.max(bounds.maxY, y) }
        : { minX: x, minY: y, maxX: x, maxY: y };
    }
  }
  return bounds;
}

export function inkLength(strokes: ReadonlyArray<Stroke>): number {
  let total = 0;
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index++) {
      const a = stroke[index - 1];
      const b = stroke[index];
      if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return total;
}

/** Assinatura aceitável: tinta suficiente e desenho que não é só um ponto ou um risquinho. */
export function isSignatureMeaningful(strokes: ReadonlyArray<Stroke>): boolean {
  const bounds = strokesBounds(strokes);
  if (!bounds) return false;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return inkLength(strokes) >= MIN_SIGNATURE_INK && Math.max(width, height) >= MIN_SIGNATURE_SIZE;
}

/** Área de recorte do PNG: o desenho com uma margem, dentro do canvas. */
export function cropRect(bounds: Bounds, canvas: { width: number; height: number }, padding = 12): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.floor(bounds.minX - padding));
  const y = Math.max(0, Math.floor(bounds.minY - padding));
  const right = Math.min(canvas.width, Math.ceil(bounds.maxX + padding));
  const bottom = Math.min(canvas.height, Math.ceil(bounds.maxY + padding));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** Reescala os traços quando o canvas muda de tamanho (girar a tela). */
export function scaleStrokes(strokes: ReadonlyArray<Stroke>, factorX: number, factorY: number): Stroke[] {
  return strokes.map((stroke) => stroke.map(({ x, y }) => ({ x: x * factorX, y: y * factorY })));
}
