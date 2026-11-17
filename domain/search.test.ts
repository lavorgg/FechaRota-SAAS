import { describe, expect, it } from "vitest";

import { customerSearchText, matchesSearch, normalizeSearchText, productSearchText, searchTokens } from "./search";

describe("normalizeSearchText", () => {
  it("tira acento, maiúscula e pontuação", () => {
    expect(normalizeSearchText("Padaria Pão-Quente", "Vila  TIBÉRIO", null, "(16) 99999-0001")).toBe("padaria pao quente vila tiberio 16 99999 0001");
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText(undefined, null)).toBe("");
  });

  it("produz o mesmo resultado que o preenchimento em SQL da migration (acentos do português)", () => {
    expect(normalizeSearchText("ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ")).toBe(
      "aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnn",
    );
  });
});

describe("searchTokens", () => {
  it("quebra em pedaços sem repetição", () => {
    expect(searchTokens("  Pão  pão Centro ")).toEqual(["pao", "centro"]);
    expect(searchTokens("(16) 99999-0001")).toEqual(["16", "99999", "0001"]);
    expect(searchTokens("   ")).toEqual([]);
    expect(searchTokens("--")).toEqual([]);
  });

  it("limita a 8 pedaços", () => {
    expect(searchTokens("a b c d e f g h i j")).toHaveLength(8);
  });
});

describe("busca de cliente e produto", () => {
  const padaria = customerSearchText({
    name: "Padaria Pão Quente",
    legalName: "Pão Quente Panificadora Ltda",
    neighborhood: "Centro",
    city: "Ribeirão Preto",
    document: "40001111000137",
    phone: "5516999990001",
  });

  it.each([
    ["PAO", true],
    ["pão quente", true],
    ["panificadora", true],
    ["centro ribeirao", true],
    ["16 99999", true],
    ["0001", true],
    ["40001111", true],
    ["padaria jardim", false],
    ["sertaozinho", false],
  ])("cliente: %j encontra = %s", (query, expected) => {
    expect(matchesSearch(padaria, searchTokens(query))).toBe(expected);
  });

  it("produto: por SKU ou nome", () => {
    const leite = productSearchText({ sku: "LEITE-1L", name: "Leite integral 1L" });
    expect(matchesSearch(leite, searchTokens("leite-1l"))).toBe(true);
    expect(matchesSearch(leite, searchTokens("integral"))).toBe(true);
    expect(matchesSearch(leite, searchTokens("queijo"))).toBe(false);
  });

  it("busca vazia encontra tudo", () => {
    expect(matchesSearch("qualquer coisa", [])).toBe(true);
  });
});
