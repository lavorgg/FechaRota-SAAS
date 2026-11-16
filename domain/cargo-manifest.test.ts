import { describe, expect, it } from "vitest";

import {
  type CargoItemInput,
  buildCargoManifest,
  calcContainersByOrder,
  calcContainersForItem,
  calcItemWeightGrams,
} from "./cargo-manifest";

const caixa = { productId: "p-caixa", sku: "CAIXA-PLAST", name: "Caixa plástica", unitsPerContainer: 12 };
const engradado = { productId: "p-eng", sku: "ENGRADADO", name: "Engradado", unitsPerContainer: null };

function leite(orderId: string, quantity: number): CargoItemInput {
  return {
    orderId,
    productId: "p-leite",
    sku: "LEITE-1L",
    productName: "Leite integral 1L",
    unit: "UN",
    quantityMilli: quantity * 1000,
    unitWeightGrams: 1050,
    container: caixa,
  };
}

function queijo(orderId: string, quantityMilli: number): CargoItemInput {
  return {
    orderId,
    productId: "p-queijo",
    sku: "QJ-MUSS",
    productName: "Queijo muçarela",
    unit: "KG",
    quantityMilli,
    unitWeightGrams: 1000,
    container: null,
  };
}

function cerveja(orderId: string, quantity: number): CargoItemInput {
  return {
    orderId,
    productId: "p-cerveja",
    sku: "CERV-600-CX",
    productName: "Cerveja 600ml cx c/24",
    unit: "CX",
    quantityMilli: quantity * 1000,
    unitWeightGrams: 24000,
    container: engradado,
  };
}

describe("buildCargoManifest", () => {
  it("soma por produto entre pedidos, inclusive KG fracionado", () => {
    const manifest = buildCargoManifest([
      leite("o1", 24),
      queijo("o1", 2750),
      leite("o2", 12),
      queijo("o2", 1250),
      queijo("o3", 500),
    ]);

    expect(manifest.orderCount).toBe(3);
    expect(manifest.products).toEqual([
      { productId: "p-leite", sku: "LEITE-1L", productName: "Leite integral 1L", unit: "UN", quantityMilli: 36000, weightGrams: 37800 },
      { productId: "p-queijo", sku: "QJ-MUSS", productName: "Queijo muçarela", unit: "KG", quantityMilli: 4500, weightGrams: 4500 },
    ]);
    expect(manifest.totalWeightGrams).toBe(42300);
    expect(manifest.weightIncomplete).toBe(false);
  });

  it("ordena as linhas por SKU", () => {
    const manifest = buildCargoManifest([queijo("o1", 1000), cerveja("o1", 1), leite("o1", 12)]);
    expect(manifest.products.map((p) => p.sku)).toEqual(["CERV-600-CX", "LEITE-1L", "QJ-MUSS"]);
  });

  it('marca "peso incompleto" quando algum produto não tem peso', () => {
    const semPeso: CargoItemInput = { ...queijo("o1", 2000), productId: "p-x", sku: "X", unitWeightGrams: null };
    const manifest = buildCargoManifest([leite("o1", 12), semPeso]);

    expect(manifest.weightIncomplete).toBe(true);
    expect(manifest.totalWeightGrams).toBe(12600);
    expect(manifest.products.find((p) => p.sku === "X")?.weightGrams).toBeNull();
  });

  it("total de vasilhames: arredonda para cima por pedido, não no total da rota", () => {
    // o1: 30 leites em caixas de 12 = 3 caixas. o2: 5 leites = 1 caixa.
    // Somando antes de arredondar daria ceil(35/12) = 3, que é menos do que sai de fato.
    const manifest = buildCargoManifest([leite("o1", 30), leite("o2", 5), cerveja("o2", 4)]);
    expect(manifest.containers).toEqual([
      { productId: "p-caixa", sku: "CAIXA-PLAST", name: "Caixa plástica", count: 4 },
      { productId: "p-eng", sku: "ENGRADADO", name: "Engradado", count: 4 },
    ]);
  });

  it("rota vazia", () => {
    expect(buildCargoManifest([])).toEqual({
      products: [],
      containers: [],
      totalWeightGrams: 0,
      weightIncomplete: false,
      orderCount: 0,
    });
  });
});

describe("vasilhames", () => {
  it("calcContainersForItem arredonda para cima", () => {
    expect(calcContainersForItem(12000, 12)).toBe(1);
    expect(calcContainersForItem(13000, 12)).toBe(2);
    expect(calcContainersForItem(30000, 12)).toBe(3);
    expect(calcContainersForItem(1000, 12)).toBe(1);
  });

  it("sem unidades por vasilhame = 1 vasilhame por unidade", () => {
    expect(calcContainersForItem(4000, null)).toBe(4);
  });

  it("recusa unidades por vasilhame inválidas", () => {
    expect(() => calcContainersForItem(1000, 0)).toThrow();
    expect(() => calcContainersForItem(1000, -1)).toThrow();
    expect(() => calcContainersForItem(1000, 1.5)).toThrow();
  });

  it("calcContainersByOrder soma linhas repetidas do mesmo produto antes de arredondar", () => {
    const byOrder = calcContainersByOrder([leite("o1", 6), leite("o1", 6), queijo("o1", 1000)]);
    expect(byOrder.get("o1")).toEqual([{ productId: "p-caixa", sku: "CAIXA-PLAST", name: "Caixa plástica", count: 1 }]);
  });

  it("produtos diferentes não dividem o mesmo vasilhame", () => {
    const iogurte: CargoItemInput = { ...leite("o1", 6), productId: "p-iog", sku: "IOG-170" };
    const byOrder = calcContainersByOrder([leite("o1", 6), iogurte]);
    expect(byOrder.get("o1")).toEqual([{ productId: "p-caixa", sku: "CAIXA-PLAST", name: "Caixa plástica", count: 2 }]);
  });

  it("pedido sem produto em vasilhame não aparece", () => {
    expect(calcContainersByOrder([queijo("o1", 1000)]).size).toBe(0);
  });
});

describe("calcItemWeightGrams", () => {
  it("arredonda para o grama mais próximo", () => {
    expect(calcItemWeightGrams(2750, 1000)).toBe(2750);
    expect(calcItemWeightGrams(12000, 1050)).toBe(12600);
    expect(calcItemWeightGrams(1, 1500)).toBe(2); // 1,5 g -> 2 g
    expect(calcItemWeightGrams(1, 1499)).toBe(1);
  });
});
