import { describe, expect, it } from "vitest";

import { formatRouteCode } from "./counters";

describe("formatRouteCode", () => {
  it("preenche com zeros até 4 dígitos e cresce depois disso", () => {
    expect(formatRouteCode(1)).toBe("R-0001");
    expect(formatRouteCode(12)).toBe("R-0012");
    expect(formatRouteCode(9999)).toBe("R-9999");
    expect(formatRouteCode(10000)).toBe("R-10000");
  });

  it("recusa sequência inválida", () => {
    expect(() => formatRouteCode(0)).toThrow();
    expect(() => formatRouteCode(-1)).toThrow();
    expect(() => formatRouteCode(1.5)).toThrow();
  });
});
