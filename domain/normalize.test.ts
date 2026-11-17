import { describe, expect, it } from "vitest";

import { formatPhoneBR, isBrazilianState, normalizeKey, normalizePhoneBR, onlyDigits } from "./normalize";

describe("normalizeKey", () => {
  it('"Centro", "centro " e "  CENTRO" viram a mesma chave', () => {
    const keys = ["Centro", "centro ", "  CENTRO", "CeNtRo\t"].map(normalizeKey);
    expect(new Set(keys)).toEqual(new Set(["centro"]));
  });

  it.each([
    ["Vila  Tibério", "vila tiberio"],
    ["Jardim   São   Luís", "jardim sao luis"],
    ["RIBEIRÃO PRETO", "ribeirao preto"],
    ["Sertãozinho", "sertaozinho"],
    ["Conceição do Mato Dentro", "conceicao do mato dentro"],
    ["Água Branca\n", "agua branca"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeKey(input)).toBe(expected);
  });

  it("é idempotente", () => {
    const once = normalizeKey("  Vila  TIBÉRIO ");
    expect(normalizeKey(once)).toBe(once);
  });

  it("bairros realmente diferentes continuam diferentes", () => {
    expect(normalizeKey("Centro")).not.toBe(normalizeKey("Centro Sul"));
    expect(normalizeKey("Vila Nova")).not.toBe(normalizeKey("Vilanova"));
  });
});

describe("normalizePhoneBR", () => {
  it.each([
    ["(16) 99999-0001", "5516999990001"],
    ["16999990001", "5516999990001"],
    ["+55 16 99999-0001", "5516999990001"],
    ["5516999990001", "5516999990001"],
    ["(16) 3333-0001", "551633330001"],
    ["+55 (16) 3333-0001", "551633330001"],
    // DDD 55 (RS) sem DDI não pode ser confundido com o DDI do Brasil.
    ["(55) 99999-0001", "5555999990001"],
    ["(55) 3222-0001", "555532220001"],
  ])("%j -> %j", (input, phone) => {
    expect(normalizePhoneBR(input)).toEqual({ ok: true, phone });
  });

  it.each(["", "999990001", "123", "(01) 99999-0001", "(16) 89999-0001", "551699999000199"])("rejeita %j", (input) => {
    expect(normalizePhoneBR(input).ok).toBe(false);
  });
});

describe("utilitários", () => {
  it("onlyDigits", () => {
    expect(onlyDigits("14.010-000")).toBe("14010000");
    expect(onlyDigits("abc")).toBe("");
  });

  it("isBrazilianState", () => {
    expect(isBrazilianState("SP")).toBe(true);
    expect(isBrazilianState("sp")).toBe(false);
    expect(isBrazilianState("XX")).toBe(false);
  });
});

describe("formatPhoneBR", () => {
  it("formata celular e fixo, com ou sem DDI", () => {
    expect(formatPhoneBR("5516999990001")).toBe("(16) 99999-0001");
    expect(formatPhoneBR("551633330001")).toBe("(16) 3333-0001");
    expect(formatPhoneBR("16999990001")).toBe("(16) 99999-0001");
  });

  it("devolve como veio o que não reconhece", () => {
    expect(formatPhoneBR("123")).toBe("123");
  });

  it("ida e volta com a normalização", () => {
    const normalized = normalizePhoneBR(formatPhoneBR("5516999990001"));
    expect(normalized).toEqual({ ok: true, phone: "5516999990001" });
  });
});
