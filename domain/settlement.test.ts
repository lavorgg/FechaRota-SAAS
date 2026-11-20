import { describe, expect, it } from "vitest";

import { type SettlementOrder, buildSettlement, calcDifferenceCents } from "./settlement";

const caixa = { productId: "caixa", sku: "CAIXA", name: "Caixa", unitsPerContainer: 12 };
const engradado = { productId: "eng", sku: "ENG", name: "Engradado", unitsPerContainer: 1 };
const leite = (quantity: number, delivered: number | null) => ({ productId: "leite", sku: "LEITE", productName: "Leite", unit: "UN" as const, quantityMilli: quantity, deliveredMilli: delivered, container: caixa });
const queijo = (quantity: number, delivered: number | null) => ({ productId: "queijo", sku: "QJ", productName: "Queijo", unit: "KG" as const, quantityMilli: quantity, deliveredMilli: delivered, container: null });
const cerveja = (quantity: number, delivered: number | null) => ({ productId: "cerv", sku: "CERV", productName: "Cerveja", unit: "CX" as const, quantityMilli: quantity, deliveredMilli: delivered, container: engradado });

function order(overrides: Partial<SettlementOrder> & Pick<SettlementOrder, "orderId" | "status" | "items">): SettlementOrder {
  return {
    orderNumber: 1,
    stopSequence: 1,
    customerName: "Cliente",
    paymentMethod: "DINHEIRO",
    paymentStatus: "RECEBIDO",
    amountToCollectCents: 0,
    proof: null,
    ...overrides,
  };
}

// Rota de ontem do seed: 1 entregue em dinheiro, 1 entregue em Pix (conferido), 1 parcial
// faturada e 1 não entregue.
const seedLike: SettlementOrder[] = [
  order({ orderId: "o1", stopSequence: 1, status: "ENTREGUE", amountToCollectCents: 25_076, proof: { cashCents: 25_076, pixCents: 0 }, items: [leite(24_000, 24_000)] }),
  order({ orderId: "o2", stopSequence: 2, status: "ENTREGUE", paymentMethod: "PIX", amountToCollectCents: 41_570, proof: { cashCents: 0, pixCents: 41_570 }, items: [cerveja(2_000, 2_000)] }),
  order({ orderId: "o3", stopSequence: 3, status: "ENTREGUE_PARCIAL", paymentMethod: "BOLETO", paymentStatus: "FATURADO", proof: { cashCents: 0, pixCents: 0 }, items: [leite(48_000, 24_000), queijo(3_250, 3_250)] }),
  order({ orderId: "o4", stopSequence: 4, status: "NAO_ENTREGUE", paymentStatus: "NAO_RECEBIDO", amountToCollectCents: 15_615, proof: { cashCents: 0, pixCents: 0 }, items: [queijo(1_500, 0)] }),
];

describe("fechamento", () => {
  it("mercadoria: carregado, entregue e devolvido (parcial + não entregue), inclusive KG", () => {
    const { goods } = buildSettlement({ orders: seedLike, movements: [], cashHandedInCents: null });
    expect(goods.map((line) => [line.sku, line.loadedMilli, line.deliveredMilli, line.returnedMilli, line.openMilli])).toEqual([
      ["CERV", 2_000, 2_000, 0, 0],
      ["LEITE", 72_000, 48_000, 24_000, 0],
      ["QJ", 4_750, 3_250, 1_500, 0],
    ]);
  });

  it("dinheiro: esperado soma só entregues e parciais; não entregue fica de fora", () => {
    const { money } = buildSettlement({ orders: seedLike, movements: [], cashHandedInCents: 25_076 });
    expect(money).toEqual({
      expectedCents: 25_076 + 41_570,
      cashCents: 25_076,
      pixInformedCents: 41_570,
      pixConfirmedCents: 41_570,
      pixPendingCents: 0,
      receivedCents: 25_076 + 41_570,
      cashHandedInCents: 25_076,
      differenceCents: 0,
    });
  });

  it("Pix a conferir não conta como recebido", () => {
    const orders = seedLike.map((item) => (item.orderId === "o2" ? { ...item, paymentStatus: "PIX_A_CONFERIR" as const } : item));
    const { money, pix } = buildSettlement({ orders, movements: [], cashHandedInCents: null });
    expect(money).toMatchObject({ pixInformedCents: 41_570, pixConfirmedCents: 0, pixPendingCents: 41_570, receivedCents: 25_076, differenceCents: null });
    expect(pix).toEqual([{ orderId: "o2", orderNumber: 1, stopSequence: 2, customerName: "Cliente", amountCents: 41_570, confirmed: false }]);
  });

  it("sobra e falta: caixa − (esperado − Pix informado)", () => {
    expect(calcDifferenceCents({ cashHandedInCents: 20_000, expectedCents: 66_646, pixInformedCents: 41_570 })).toBe(-5_076);
    expect(calcDifferenceCents({ cashHandedInCents: 26_000, expectedCents: 66_646, pixInformedCents: 41_570 })).toBe(924);
    // Cliente pagou menos no Pix: a falta aparece no caixa esperado.
    const orders = seedLike.map((item) => (item.orderId === "o2" ? { ...item, proof: { cashCents: 0, pixCents: 40_000 } } : item));
    expect(buildSettlement({ orders, movements: [], cashHandedInCents: 25_076 }).money.differenceCents).toBe(-1_570);
  });

  it("vasilhames: saíram pelo pedido; deixados e recolhidos pelos movimentos", () => {
    const { containers } = buildSettlement({
      orders: seedLike,
      movements: [
        { containerProductId: "caixa", sku: "CAIXA", name: "Caixa", delivered: 2, returned: 1 },
        { containerProductId: "eng", sku: "ENG", name: "Engradado", delivered: 2, returned: 2 },
        { containerProductId: "caixa", sku: "CAIXA", name: "Caixa", delivered: 2, returned: 0 },
      ],
      cashHandedInCents: null,
    });
    // Caixas que saíram: 24 leites (2) + 48 leites (4) = 6.
    expect(containers).toEqual([
      { productId: "caixa", sku: "CAIXA", name: "Caixa", out: 6, left: 4, collected: 1, backToDepot: 3, withCustomers: 3 },
      { productId: "eng", sku: "ENG", name: "Engradado", out: 2, left: 2, collected: 2, backToDepot: 2, withCustomers: 0 },
    ]);
  });

  it("rota em andamento: paradas sem desfecho ficam à parte", () => {
    const orders = [...seedLike, order({ orderId: "o5", stopSequence: 5, status: "EM_ROTA", amountToCollectCents: 9_999, items: [queijo(2_000, null)] })];
    const settlement = buildSettlement({ orders, movements: [], cashHandedInCents: null });
    expect(settlement.openStops).toBe(1);
    expect(settlement.goods.find((line) => line.sku === "QJ")).toMatchObject({ loadedMilli: 6_750, deliveredMilli: 3_250, returnedMilli: 1_500, openMilli: 2_000 });
    expect(settlement.money.expectedCents).toBe(25_076 + 41_570);
  });
});
