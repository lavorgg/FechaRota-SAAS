import { describe, expect, it } from "vitest";

import { type PlanningOrder, exceedsCapacity, groupByCityAndNeighborhood, orderWeight, suggestRouteName, suggestStopOrder, summarizeLoad } from "./route-planning";
import { preferredOf, preferredSpelling } from "./spelling";

let seq = 0;
function order(overrides: Partial<PlanningOrder>): PlanningOrder {
  seq += 1;
  return {
    id: `o${seq}`,
    orderNumber: seq,
    customerName: `Cliente ${seq}`,
    city: "Ribeirão Preto",
    cityKey: "ribeirao preto",
    neighborhood: "Centro",
    neighborhoodKey: "centro",
    street: "Rua A",
    number: "1",
    totalCents: 1000,
    items: [{ quantityMilli: 12000, unitWeightGrams: 1050 }],
    ...overrides,
  };
}

describe("peso, volumes e valor", () => {
  it("peso é a soma de quantidade × peso unitário; volumes são os itens", () => {
    const summary = summarizeLoad([
      order({ items: [{ quantityMilli: 12000, unitWeightGrams: 1050 }, { quantityMilli: 2750, unitWeightGrams: 1000 }], totalCents: 5000 }),
      order({ items: [{ quantityMilli: 1000, unitWeightGrams: 24000 }], totalCents: 13900 }),
    ]);
    expect(summary).toEqual({ orderCount: 2, weightGrams: 12600 + 2750 + 24000, weightIncomplete: false, volumes: 3, totalCents: 18900 });
  });

  it('marca "peso incompleto" quando algum produto não tem peso', () => {
    const o = order({ items: [{ quantityMilli: 1000, unitWeightGrams: null }, { quantityMilli: 2000, unitWeightGrams: 500 }] });
    expect(orderWeight(o)).toEqual({ grams: 1000, incomplete: true });
    expect(summarizeLoad([o]).weightIncomplete).toBe(true);
  });
});

describe("agrupamento por cidade e bairro", () => {
  it("agrupa pela chave normalizada e mostra a grafia mais usada", () => {
    const groups = groupByCityAndNeighborhood([
      order({ neighborhood: "Centro" }),
      order({ neighborhood: "centro " }),
      order({ neighborhood: "CENTRO" }),
      order({ neighborhood: "Centro" }),
      order({ neighborhood: "Vila Tibério", neighborhoodKey: "vila tiberio" }),
      order({ city: "Sertãozinho", cityKey: "sertaozinho", neighborhood: "Centro" }),
      order({ city: "Sertaozinho", cityKey: "sertaozinho", neighborhood: "Centro" }),
    ]);
    expect(groups.map((g) => [g.city, g.orderCount, g.neighborhoods.map((n) => [n.neighborhood, n.orderCount])])).toEqual([
      ["Ribeirão Preto", 5, [["Centro", 4], ["Vila Tibério", 1]]],
      ["Sertãozinho", 2, [["Centro", 2]]],
    ]);
    expect(groups[0]?.neighborhoods[0]?.key).toBe("ribeirao preto|centro");
  });
});

describe("ordem sugerida", () => {
  it("cidade, bairro, rua e número (numérico, não alfabético)", () => {
    const sorted = suggestStopOrder([
      order({ orderNumber: 1, neighborhoodKey: "vila", street: "Rua B", number: "10" }),
      order({ orderNumber: 2, street: "Rua Álvares", number: "1250" }),
      order({ orderNumber: 3, street: "Rua Alvares", number: "88" }),
      order({ orderNumber: 4, street: "Rua Alvares", number: "s/n" }),
      order({ orderNumber: 5, street: "Rua Alvares", number: "88A" }),
      order({ orderNumber: 6, cityKey: "araraquara", street: "Rua Z", number: "1" }),
    ]);
    expect(sorted.map((o) => o.orderNumber)).toEqual([6, 3, 5, 2, 4, 1]);
  });

  it("não altera a lista recebida", () => {
    const list = [order({ number: "2" }), order({ number: "1" })];
    suggestStopOrder(list);
    expect(list.map((o) => o.number)).toEqual(["2", "1"]);
  });
});

describe("capacidade", () => {
  it("avisa só acima da capacidade; sem capacidade cadastrada, nunca", () => {
    expect(exceedsCapacity(1_500_000, 1500)).toBe(false);
    expect(exceedsCapacity(1_500_001, 1500)).toBe(true);
    expect(exceedsCapacity(9_999_999, null)).toBe(false);
  });
});

describe("grafia preferida", () => {
  it("mais usada; no empate, inicial maiúscula e acento", () => {
    expect(preferredOf(["CENTRO", "Centro", "centro ", "CENTRO"])).toBe("CENTRO");
    expect(preferredOf(["CENTRO", "Centro"])).toBe("Centro");
    expect(preferredOf(["Sertaozinho", "Sertãozinho"])).toBe("Sertãozinho");
    expect(preferredSpelling([])).toBe("");
  });
});

describe("suggestRouteName", () => {
  const place = (neighborhood: string, city: string) => ({ neighborhood, neighborhoodKey: neighborhood.trim().toLowerCase(), city, cityKey: city.toLowerCase() });

  it("lista os bairros na grafia mais usada", () => {
    expect(suggestRouteName([place("Centro", "Franca"), place("centro ", "Franca"), place("Centro", "Franca"), place("Estação", "Franca")])).toBe("Centro / Estação");
  });

  it("com mais de uma cidade, cada bairro leva a cidade", () => {
    expect(suggestRouteName([place("Centro", "Franca"), place("Centro", "Batatais")])).toBe("Centro (Batatais) / Centro (Franca)");
  });

  it("corta no tamanho máximo do nome", () => {
    expect(suggestRouteName([place("Bairro com nome bem comprido", "Franca"), place("Outro bairro comprido", "Franca")], 20)).toBe("Bairro com nome bem");
    expect(suggestRouteName([])).toBe("");
  });
});
