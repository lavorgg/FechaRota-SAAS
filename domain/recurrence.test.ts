import { describe, expect, it } from "vitest";

import { isTemplateDueOn } from "./recurrence";

// 2026-11-16 é segunda-feira.
const base = { dayOfWeek: "SEG" as const, active: true, startsOn: "2026-01-05", pausedUntil: null };

describe("isTemplateDueOn", () => {
  it("vale no dia da semana do template", () => {
    expect(isTemplateDueOn(base, "2026-11-16")).toBe(true);
    expect(isTemplateDueOn(base, "2026-11-23")).toBe(true);
  });

  it("não vale nos outros dias da semana", () => {
    for (const date of ["2026-11-15", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]) {
      expect(isTemplateDueOn(base, date)).toBe(false);
    }
  });

  it("template inativo nunca vale", () => {
    expect(isTemplateDueOn({ ...base, active: false }, "2026-11-16")).toBe(false);
  });

  it("respeita a data de início, que conta", () => {
    expect(isTemplateDueOn({ ...base, startsOn: "2026-11-16" }, "2026-11-16")).toBe(true);
    expect(isTemplateDueOn({ ...base, startsOn: "2026-11-17" }, "2026-11-16")).toBe(false);
    expect(isTemplateDueOn({ ...base, startsOn: "2026-11-17" }, "2026-11-23")).toBe(true);
  });

  it("pausado até um dia inclui esse dia", () => {
    expect(isTemplateDueOn({ ...base, pausedUntil: "2026-11-16" }, "2026-11-16")).toBe(false);
    expect(isTemplateDueOn({ ...base, pausedUntil: "2026-11-15" }, "2026-11-16")).toBe(true);
    expect(isTemplateDueOn({ ...base, pausedUntil: "2026-11-22" }, "2026-11-23")).toBe(true);
    expect(isTemplateDueOn({ ...base, pausedUntil: "2026-12-31" }, "2026-11-23")).toBe(false);
  });

  it("recusa data malformada", () => {
    expect(() => isTemplateDueOn(base, "16/11/2026")).toThrow();
  });
});
