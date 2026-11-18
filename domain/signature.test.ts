import { describe, expect, it } from "vitest";

import { cropRect, inkLength, isSignatureMeaningful, scaleStrokes, strokesBounds } from "./signature";

const line = (x1: number, y1: number, x2: number, y2: number, steps = 10) =>
  Array.from({ length: steps + 1 }, (_, i) => ({ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }));

describe("assinatura", () => {
  it("vazia, ponto ou risquinho não valem", () => {
    expect(isSignatureMeaningful([])).toBe(false);
    expect(isSignatureMeaningful([[{ x: 10, y: 10 }]])).toBe(false);
    expect(isSignatureMeaningful([line(10, 10, 30, 12)])).toBe(false);
    // Muita tinta num quadradinho de 10 px: rabisco, não assinatura.
    expect(isSignatureMeaningful(Array.from({ length: 20 }, () => line(10, 10, 20, 20)))).toBe(false);
  });

  it("traço com tamanho e tinta suficientes vale", () => {
    expect(isSignatureMeaningful([line(10, 40, 120, 20), line(30, 60, 90, 30)])).toBe(true);
  });

  it("limites, tinta e recorte com margem dentro do canvas", () => {
    const strokes = [line(5, 10, 105, 40)];
    expect(strokesBounds(strokes)).toEqual({ minX: 5, minY: 10, maxX: 105, maxY: 40 });
    expect(Math.round(inkLength(strokes))).toBe(104);
    expect(cropRect({ minX: 5, minY: 10, maxX: 105, maxY: 40 }, { width: 110, height: 200 })).toEqual({ x: 0, y: 0, width: 110, height: 52 });
  });

  it("reescala os traços ao girar a tela", () => {
    expect(scaleStrokes([[{ x: 10, y: 20 }]], 2, 0.5)).toEqual([[{ x: 20, y: 10 }]]);
  });
});
