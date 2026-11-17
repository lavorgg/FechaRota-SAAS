import { describe, expect, it } from "vitest";

import { formatCep, parseCep } from "./cep";
import { formatPlate, parsePlate } from "./plate";

describe("placa", () => {
  it.each([
    ["ABC1234", "ABC1234"],
    ["abc-1234", "ABC1234"],
    ["ABC1D23", "ABC1D23"],
    [" frt 1a23 ", "FRT1A23"],
  ])("aceita %j", (input, plate) => {
    expect(parsePlate(input)).toEqual({ ok: true, plate });
  });

  it.each(["", "AB1234", "ABCD123", "1BC1234", "ABC12345", "ABC1DD3"])("recusa %j", (input) => {
    expect(parsePlate(input).ok).toBe(false);
  });

  it("formata", () => {
    expect(formatPlate("ABC1234")).toBe("ABC-1234");
    expect(formatPlate("ABC1D23")).toBe("ABC1D23");
  });
});

describe("CEP", () => {
  it("aceita com ou sem traço", () => {
    expect(parseCep("14010-000")).toEqual({ ok: true, cep: "14010000" });
    expect(parseCep("14010000")).toEqual({ ok: true, cep: "14010000" });
  });

  it.each(["", "1401000", "140100000", "00000000", "abcdefgh"])("recusa %j", (input) => {
    expect(parseCep(input).ok).toBe(false);
  });

  it("formata", () => {
    expect(formatCep("14010000")).toBe("14010-000");
  });
});
