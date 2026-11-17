import { describe, expect, it } from "vitest";

import { type CatalogProduct, MAX_ORDER_ITEMS, priceOrderLines } from "./order-lines";

const catalog = new Map<string, CatalogProduct>([
  ["leite", { id: "leite", name: "Leite 1L", unit: "UN", priceCents: 549, active: true }],
  ["queijo", { id: "queijo", name: "Queijo", unit: "KG", priceCents: 4290, active: true }],
  ["velho", { id: "velho", name: "Produto antigo", unit: "UN", priceCents: 100, active: false }],
]);

describe("priceOrderLines", () => {
  it("calcula subtotais e total com o preço do cadastro, inclusive KG fracionado", () => {
    const result = priceOrderLines([{ productId: "leite", quantity: "12" }, { productId: "queijo", quantity: "2,750" }], catalog);
    expect(result).toEqual({
      ok: true,
      totalCents: 6588 + 11798,
      lines: [
        { productId: "leite", productName: "Leite 1L", unit: "UN", quantityMilli: 12000, unitPriceCents: 549, subtotalCents: 6588 },
        { productId: "queijo", productName: "Queijo", unit: "KG", quantityMilli: 2750, unitPriceCents: 4290, subtotalCents: 11798 },
      ],
    });
  });

  it("usa o preço do template quando informado (gerador de recorrência)", () => {
    const result = priceOrderLines([{ productId: "leite", quantity: "10", unitPriceCents: 500 }], catalog);
    expect(result.ok && result.lines[0]?.unitPriceCents).toBe(500);
    expect(result.ok && result.totalCents).toBe(5000);
  });

  it("aponta o erro de cada linha", () => {
    const result = priceOrderLines(
      [
        { productId: "leite", quantity: "1,5" },
        { productId: "nao-existe", quantity: "1" },
        { productId: "velho", quantity: "1" },
        { productId: "queijo", quantity: "0" },
        { productId: "queijo", quantity: "abc" },
        { productId: "leite", quantity: "3" },
      ],
      catalog,
    );
    expect(result).toEqual({
      ok: false,
      error: "Confira os itens destacados.",
      lineErrors: {
        0: "Quantidade em UN deve ser um número inteiro.",
        1: "Produto não encontrado.",
        2: "Produto antigo está inativo.",
        3: "A quantidade deve ser maior que zero.",
        4: "Quantidade inválida. Use até 3 casas decimais.",
      },
    });
  });

  it("exige pelo menos um item e no máximo o limite", () => {
    expect(priceOrderLines([], catalog)).toMatchObject({ ok: false, error: "Adicione pelo menos um item." });
    const many = Array.from({ length: MAX_ORDER_ITEMS + 1 }, () => ({ productId: "leite", quantity: "1" }));
    expect(priceOrderLines(many, catalog).ok).toBe(false);
  });
});
