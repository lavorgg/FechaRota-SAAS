import { describe, expect, it } from "vitest";

import {
  PRODUCT_UNITS,
  calcOrderTotalCents,
  calcSubtotalCents,
  decimalStringToMilli,
  formatQuantity,
  milliToDecimalString,
  parseQuantityToMilli,
  unitAllowsFraction,
  validateQuantityForUnit,
} from "./quantity";

describe("parseQuantityToMilli", () => {
  it.each([
    ["3", 3000],
    ["2,750", 2750],
    ["2.75", 2750],
    ["0,5", 500],
    ["0,001", 1],
    [" 12 ", 12000],
  ])("aceita %j como %i milésimos", (input, milli) => {
    expect(parseQuantityToMilli(input)).toEqual({ ok: true, milli });
  });

  it.each(["", "abc", "-1", "1,2345", "1.234,5", "0", "0,000", "99999999999"])("rejeita %j", (input) => {
    expect(parseQuantityToMilli(input).ok).toBe(false);
  });
});

describe("validateQuantityForUnit", () => {
  it("só KG aceita fração", () => {
    expect(PRODUCT_UNITS.filter(unitAllowsFraction)).toEqual(["KG"]);
  });

  it("aceita 2,750 kg", () => {
    expect(validateQuantityForUnit(2750, "KG")).toEqual({ ok: true, milli: 2750 });
  });

  it.each(["CX", "DZ", "FD", "UN", "PCT"] as const)("rejeita quantidade fracionada em %s", (unit) => {
    expect(validateQuantityForUnit(2500, unit)).toEqual({
      ok: false,
      error: `Quantidade em ${unit} deve ser um número inteiro.`,
    });
    expect(validateQuantityForUnit(3000, unit)).toEqual({ ok: true, milli: 3000 });
  });

  it("rejeita zero, negativo e não inteiro", () => {
    expect(validateQuantityForUnit(0, "KG").ok).toBe(false);
    expect(validateQuantityForUnit(-1000, "UN").ok).toBe(false);
    expect(validateQuantityForUnit(1.5, "KG").ok).toBe(false);
  });
});

describe("conversão para o banco", () => {
  it("milliToDecimalString sempre usa ponto e 3 casas", () => {
    expect(milliToDecimalString(2750)).toBe("2.750");
    expect(milliToDecimalString(3000)).toBe("3.000");
    expect(milliToDecimalString(1)).toBe("0.001");
  });

  it("decimalStringToMilli lê o que o Postgres devolve", () => {
    expect(decimalStringToMilli("2.750")).toBe(2750);
    expect(decimalStringToMilli("3")).toBe(3000);
    expect(decimalStringToMilli("0.5")).toBe(500);
    expect(() => decimalStringToMilli("-1")).toThrow();
    expect(() => decimalStringToMilli("1.2345")).toThrow();
  });

  it("ida e volta não perde precisão", () => {
    for (const milli of [1, 999, 1000, 2750, 1234567, 9_999_999_999]) {
      expect(decimalStringToMilli(milliToDecimalString(milli))).toBe(milli);
    }
  });

  it("formatQuantity exibe em pt-BR sem zeros à direita", () => {
    expect(formatQuantity(2750)).toBe("2,75");
    expect(formatQuantity(3000)).toBe("3");
    expect(formatQuantity(2755)).toBe("2,755");
    expect(formatQuantity(1500000)).toBe("1.500");
  });
});

describe("calcSubtotalCents", () => {
  it("quantidade inteira", () => {
    expect(calcSubtotalCents(3000, 549)).toBe(1647);
  });

  it("quantidade fracionada: 2,750 kg × R$ 42,90 = R$ 117,975 -> R$ 117,98", () => {
    expect(calcSubtotalCents(2750, 4290)).toBe(11798);
  });

  it("meio centavo arredonda para cima", () => {
    // 0,500 × R$ 0,01 = 0,5 centavo -> 1 centavo
    expect(calcSubtotalCents(500, 1)).toBe(1);
    // 0,499 × R$ 0,01 = 0,499 centavo -> 0
    expect(calcSubtotalCents(499, 1)).toBe(0);
    // 1,005 × R$ 1,00 = 100,5 centavos -> 101
    expect(calcSubtotalCents(1005, 100)).toBe(101);
    // 1,004 × R$ 1,00 = 100,4 centavos -> 100
    expect(calcSubtotalCents(1004, 100)).toBe(100);
  });

  it("não usa ponto flutuante: 1,15 kg × R$ 1,00 = R$ 1,15 exatos", () => {
    // Em float, 1.15 * 100 = 114.99999999999999.
    expect(calcSubtotalCents(1150, 100)).toBe(115);
    expect(calcSubtotalCents(4350, 100)).toBe(435);
  });

  it("zero e limites", () => {
    expect(calcSubtotalCents(0, 4290)).toBe(0);
    expect(calcSubtotalCents(2750, 0)).toBe(0);
    expect(calcSubtotalCents(9_999_999_999, 1_000_000)).toBe(9_999_999_999_000);
  });

  it("recusa entrada inválida", () => {
    expect(() => calcSubtotalCents(-1, 100)).toThrow();
    expect(() => calcSubtotalCents(1000, -100)).toThrow();
    expect(() => calcSubtotalCents(1.5, 100)).toThrow();
    expect(() => calcSubtotalCents(1000, 10.5)).toThrow();
  });
});

describe("calcOrderTotalCents", () => {
  it("soma os subtotais já arredondados de cada item", () => {
    const items = [
      { quantityMilli: 2750, unitPriceCents: 4290 }, // 11798
      { quantityMilli: 12000, unitPriceCents: 549 }, // 6588
      { quantityMilli: 1000, unitPriceCents: 13900 }, // 13900
    ];
    expect(calcOrderTotalCents(items)).toBe(11798 + 6588 + 13900);
  });

  it("arredonda por item, não no total", () => {
    // Três itens de 0,5 centavo cada: por item dá 1+1+1 = 3 (no total seria 2).
    const items = Array.from({ length: 3 }, () => ({ quantityMilli: 500, unitPriceCents: 1 }));
    expect(calcOrderTotalCents(items)).toBe(3);
  });

  it("pedido sem itens tem total zero", () => {
    expect(calcOrderTotalCents([])).toBe(0);
  });
});

describe("milliToInput", () => {
  it("formata para o campo e volta igual", async () => {
    const { milliToInput } = await import("./quantity");
    for (const [milli, text] of [[1000, "1"], [2750, "2,75"], [1050, "1,05"], [1, "0,001"], [1500000, "1500"]] as const) {
      expect(milliToInput(milli)).toBe(text);
      expect(parseQuantityToMilli(text)).toEqual({ ok: true, milli });
    }
  });
});
