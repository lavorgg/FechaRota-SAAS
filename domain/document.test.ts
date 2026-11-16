import { describe, expect, it } from "vitest";

import { calcCNPJCheckDigits, formatDocument, isValidCNPJ, isValidCPF, stripDocument, validateDocument } from "./document";

describe("CPF", () => {
  it.each(["529.982.247-25", "52998224725", "111.444.777-35", "935.411.347-80"])("aceita %s", (cpf) => {
    expect(isValidCPF(cpf)).toBe(true);
  });

  it.each([
    "529.982.247-26", // dígito verificador errado
    "529.982.247-2", // curto
    "5299822472500", // longo
    "000.000.000-00", // sequência repetida
    "111.111.111-11",
    "999.999.999-99",
    "abc.def.ghi-jk",
    "",
  ])("rejeita %j", (cpf) => {
    expect(isValidCPF(cpf)).toBe(false);
  });
});

describe("CNPJ", () => {
  it.each(["11.222.333/0001-81", "11222333000181", "11.444.777/0001-61", "00.000.000/0001-91"])("aceita %s", (cnpj) => {
    expect(isValidCNPJ(cnpj)).toBe(true);
  });

  it.each([
    "11.222.333/0001-82", // dígito verificador errado
    "11.222.333/0001-8", // curto
    "00.000.000/0000-00", // sequência repetida
    "11.111.111/1111-11",
    "",
  ])("rejeita %j", (cnpj) => {
    expect(isValidCNPJ(cnpj)).toBe(false);
  });

  it("aceita CNPJ alfanumérico (exemplo oficial da Receita Federal)", () => {
    expect(calcCNPJCheckDigits("12ABC34501DE")).toBe("35");
    expect(isValidCNPJ("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCNPJ("12.abc.345/01de-35")).toBe(true);
    expect(isValidCNPJ("12.ABC.345/01DE-36")).toBe(false);
  });

  it("os dígitos verificadores nunca são letras", () => {
    expect(isValidCNPJ("12ABC34501DEAB")).toBe(false);
  });

  it("calcCNPJCheckDigits recusa base malformada", () => {
    expect(() => calcCNPJCheckDigits("123")).toThrow();
    expect(() => calcCNPJCheckDigits("12ABC34501D!")).toThrow();
  });
});

describe("validateDocument", () => {
  it("identifica o tipo e devolve sem pontuação", () => {
    expect(validateDocument("529.982.247-25")).toEqual({ ok: true, kind: "CPF", value: "52998224725" });
    expect(validateDocument("11.222.333/0001-81")).toEqual({ ok: true, kind: "CNPJ", value: "11222333000181" });
    expect(validateDocument("12.abc.345/01de-35")).toEqual({ ok: true, kind: "CNPJ", value: "12ABC34501DE35" });
  });

  it("mensagens em português", () => {
    expect(validateDocument("529.982.247-26")).toEqual({ ok: false, error: "CPF inválido." });
    expect(validateDocument("11.222.333/0001-82")).toEqual({ ok: false, error: "CNPJ inválido." });
    expect(validateDocument("123")).toEqual({
      ok: false,
      error: "Informe um CPF (11 dígitos) ou um CNPJ (14 caracteres).",
    });
  });

  it("formatDocument e stripDocument são inversos", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocument("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(stripDocument(formatDocument("11222333000181"))).toBe("11222333000181");
  });
});
