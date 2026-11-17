import { describe, expect, it } from "vitest";

import { resolveSelectedDate } from "./selected-date";

const SP = "America/Sao_Paulo";
const now = new Date("2026-11-17T01:00:00Z"); // 22h de 16/11 em São Paulo

describe("resolveSelectedDate", () => {
  it("usa a data válida da URL", () => {
    expect(resolveSelectedDate("2026-11-10", SP, now)).toBe("2026-11-10");
    expect(resolveSelectedDate(["2026-11-10", "2026-11-11"], SP, now)).toBe("2026-11-10");
  });

  it('sem data ou com data inválida, é "hoje" no fuso da empresa', () => {
    for (const raw of [undefined, "", "ontem", "2026-02-30", "16/11/2026", []]) {
      expect(resolveSelectedDate(raw, SP, now)).toBe("2026-11-16");
    }
    expect(resolveSelectedDate(undefined, "UTC", now)).toBe("2026-11-17");
  });
});
