import { describe, expect, it } from "vitest";

import { formatCents, parseBRLToCents } from "./money";

describe("parseBRLToCents", () => {
  it.each([
    ["12,5", 1250],
    ["12,50", 1250],
    ["1.234,56", 123456],
    ["0,01", 1],
    ["12", 1200],
    ["0", 0],
    ["0,00", 0],
    ["1.234", 123400],
    ["1.234.567,89", 123456789],
    ["R$ 12,50", 1250],
    ["  7,05  ", 705],
  ])("aceita %j como %i centavos", (input, cents) => {
    expect(parseBRLToCents(input)).toEqual({ ok: true, cents });
  });

  it.each([
    ["", "Informe um valor."],
    ["   ", "Informe um valor."],
    ["abc", "Valor inválido. Use o formato 12,50."],
    ["-5", "O valor não pode ser negativo."],
    ["-0,01", "O valor não pode ser negativo."],
    ["12.50", "Valor inválido. Use o formato 12,50."],
    ["12,505", "Valor inválido. Use o formato 12,50."],
    ["1,234,56", "Valor inválido. Use o formato 12,50."],
    ["12.34,56", "Valor inválido. Use o formato 12,50."],
    ["12,", "Valor inválido. Use o formato 12,50."],
    [",50", "Valor inválido. Use o formato 12,50."],
    ["1e3", "Valor inválido. Use o formato 12,50."],
    ["99999999999", "Valor acima do limite permitido."],
  ])("rejeita %j", (input, error) => {
    expect(parseBRLToCents(input)).toEqual({ ok: false, error });
  });

  it("não sofre com ponto flutuante (0,29 e 1,15)", () => {
    expect(parseBRLToCents("0,29")).toEqual({ ok: true, cents: 29 });
    expect(parseBRLToCents("1,15")).toEqual({ ok: true, cents: 115 });
    expect(parseBRLToCents("19,99")).toEqual({ ok: true, cents: 1999 });
  });
});

describe("formatCents", () => {
  // O Intl usa espaço não separável (U+00A0) entre "R$" e o número.
  const normalize = (text: string) => text.replace(/ /g, " ");

  it.each([
    [0, "R$ 0,00"],
    [1, "R$ 0,01"],
    [1250, "R$ 12,50"],
    [123456, "R$ 1.234,56"],
    [-500, "-R$ 5,00"],
  ])("formata %i como %j", (cents, expected) => {
    expect(normalize(formatCents(cents))).toBe(expected);
  });

  it("recusa valor que não é inteiro", () => {
    expect(() => formatCents(12.5)).toThrow();
    expect(() => formatCents(Number.NaN)).toThrow();
  });

  it("ida e volta: o que foi formatado é lido de volta igual", () => {
    for (const cents of [0, 1, 99, 100, 1250, 123456, 99999999]) {
      expect(parseBRLToCents(formatCents(cents))).toEqual({ ok: true, cents });
    }
  });
});
