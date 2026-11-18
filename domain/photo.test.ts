import { describe, expect, it } from "vitest";

import { PHOTO_QUALITY, fitWithin, nextCompressionStep } from "./photo";

describe("foto", () => {
  it("lado maior até 1600 px, sem aumentar foto pequena", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(() => fitWithin(0, 10)).toThrow();
  });

  it("acima da meta: baixa a qualidade até 0,45 e depois reduz o tamanho", () => {
    let step: { quality: number; maxSide: number } | null = { quality: PHOTO_QUALITY, maxSide: 1600 };
    const seen: Array<{ quality: number; maxSide: number }> = [];
    while (step) {
      seen.push(step);
      step = nextCompressionStep(step);
    }
    expect(seen.slice(0, 4)).toEqual([
      { quality: 0.7, maxSide: 1600 },
      { quality: 0.6, maxSide: 1600 },
      { quality: 0.5, maxSide: 1600 },
      { quality: 0.7, maxSide: 1280 },
    ]);
    expect(seen.at(-1)?.maxSide).toBeGreaterThanOrEqual(640);
  });
});
