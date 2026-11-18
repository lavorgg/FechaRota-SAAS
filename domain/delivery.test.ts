import { describe, expect, it } from "vitest";

import {
  type DeliveryContext,
  type DeliveryDraft,
  type DeliveryLine,
  amountToCollectAfterDelivery,
  containersForDelivery,
  deliveredQuantities,
  deliveredValueCents,
  paymentStatusAfterDelivery,
  validateDeliveryDraft,
} from "./delivery";

const caixa = { productId: "caixa", sku: "CAIXA", name: "Caixa", unitsPerContainer: 12 };
const lines: DeliveryLine[] = [
  { orderItemId: "leite", productId: "p-leite", productName: "Leite 1L", unit: "UN", quantityMilli: 24_000, unitPriceCents: 549, container: caixa },
  { orderItemId: "queijo", productId: "p-queijo", productName: "Queijo (kg)", unit: "KG", quantityMilli: 2_750, unitPriceCents: 4_290, container: null },
];
// 24 × 5,49 + 2,75 × 42,90 = 131,76 + 117,98 (117,975 arredondado por item)
const total = 13_176 + 11_798;

const ctx = (overrides: Partial<DeliveryContext> = {}): DeliveryContext => ({ lines, paymentMethod: "DINHEIRO", proofPolicy: "PHOTO_OR_SIGNATURE", amountToCollectCents: total, ...overrides });

function draft(overrides: Partial<DeliveryDraft> = {}): DeliveryDraft {
  return {
    outcome: "ENTREGUE",
    items: [],
    failureReason: null,
    failureNote: null,
    cashCents: total,
    pixCents: 0,
    confirmDifferentAmount: false,
    containers: [{ containerProductId: "caixa", delivered: 2, returned: 1 }],
    receiverName: "Maria",
    receiverDocument: null,
    hasSignature: true,
    photoCount: 0,
    ...overrides,
  };
}

const partial = (leite: number, queijo: number, reasons: Partial<Record<"leite" | "queijo", string>> = { leite: "Avaria", queijo: "Cliente recusou" }) =>
  draft({
    outcome: "ENTREGUE_PARCIAL",
    items: [
      { orderItemId: "leite", deliveredMilli: leite, returnReason: reasons.leite ?? null },
      { orderItemId: "queijo", deliveredMilli: queijo, returnReason: reasons.queijo ?? null },
    ],
  });

describe("quantidades e valor entregue", () => {
  it("entregue = tudo; não entregue = nada; parcial = o informado", () => {
    expect([...deliveredQuantities(draft(), lines).values()]).toEqual([24_000, 2_750]);
    expect([...deliveredQuantities(draft({ outcome: "NAO_ENTREGUE" }), lines).values()]).toEqual([0, 0]);
    expect([...deliveredQuantities(partial(20_000, 1_500), lines).values()]).toEqual([20_000, 1_500]);
  });

  it("parcial recalcula com arredondamento por item e substitui o valor a cobrar", () => {
    const delivered = deliveredQuantities(partial(20_000, 1_500), lines);
    // 20 × 5,49 = 109,80; 1,5 × 42,90 = 64,35
    expect(deliveredValueCents(lines, delivered)).toBe(10_980 + 6_435);
    expect(amountToCollectAfterDelivery({ outcome: "ENTREGUE_PARCIAL", paymentMethod: "PIX", currentAmountCents: total, lines, delivered })).toBe(17_415);
    expect(amountToCollectAfterDelivery({ outcome: "ENTREGUE_PARCIAL", paymentMethod: "FATURADO", currentAmountCents: 0, lines, delivered })).toBe(0);
    expect(amountToCollectAfterDelivery({ outcome: "ENTREGUE", paymentMethod: "PIX", currentAmountCents: total, lines, delivered })).toBe(total);
    expect(amountToCollectAfterDelivery({ outcome: "NAO_ENTREGUE", paymentMethod: "PIX", currentAmountCents: total, lines, delivered })).toBe(total);
  });

  it("vasilhames saem pelo que foi entregue", () => {
    expect(containersForDelivery(lines, deliveredQuantities(draft(), lines))).toEqual([{ productId: "caixa", sku: "CAIXA", name: "Caixa", count: 2 }]);
    expect(containersForDelivery(lines, deliveredQuantities(partial(13_000, 0), lines))).toEqual([{ productId: "caixa", sku: "CAIXA", name: "Caixa", count: 2 }]);
    expect(containersForDelivery(lines, deliveredQuantities(partial(12_000, 0), lines))).toEqual([{ productId: "caixa", sku: "CAIXA", name: "Caixa", count: 1 }]);
    expect(containersForDelivery(lines, deliveredQuantities(draft({ outcome: "NAO_ENTREGUE" }), lines))).toEqual([]);
  });
});

describe("situação do pagamento", () => {
  const status = (paymentMethod: "PIX" | "DINHEIRO" | "BOLETO" | "FATURADO", outcome: "ENTREGUE" | "NAO_ENTREGUE", cashCents: number, pixCents: number) =>
    paymentStatusAfterDelivery({ paymentMethod, outcome, cashCents, pixCents });
  it("faturado e boleto continuam faturados", () => {
    expect(status("FATURADO", "ENTREGUE", 0, 0)).toBe("FATURADO");
    expect(status("BOLETO", "NAO_ENTREGUE", 0, 0)).toBe("FATURADO");
  });
  it("Pix fica a conferir; só dinheiro é recebido; nada é não recebido", () => {
    expect(status("PIX", "ENTREGUE", 0, 100)).toBe("PIX_A_CONFERIR");
    expect(status("DINHEIRO", "ENTREGUE", 50, 50)).toBe("PIX_A_CONFERIR");
    expect(status("DINHEIRO", "ENTREGUE", 100, 0)).toBe("RECEBIDO");
    expect(status("DINHEIRO", "ENTREGUE", 0, 0)).toBe("NAO_RECEBIDO");
    expect(status("PIX", "NAO_ENTREGUE", 0, 0)).toBe("NAO_RECEBIDO");
  });
});

describe("validação do comprovante", () => {
  it("entrega completa válida", () => {
    expect(validateDeliveryDraft(draft(), ctx())).toEqual({});
  });

  it("política de comprovante: assinatura obrigatória ou foto/assinatura", () => {
    expect(validateDeliveryDraft(draft({ hasSignature: false, photoCount: 1 }), ctx())).toEqual({});
    expect(validateDeliveryDraft(draft({ hasSignature: false, photoCount: 0 }), ctx()).signature).toBe("Colete a assinatura ou tire uma foto.");
    expect(validateDeliveryDraft(draft({ hasSignature: false, photoCount: 2 }), ctx({ proofPolicy: "SIGNATURE_REQUIRED" })).signature).toBe("A assinatura do recebedor é obrigatória.");
  });

  it("nome do recebedor é obrigatório quando houve entrega", () => {
    expect(validateDeliveryDraft(draft({ receiverName: " " }), ctx()).receiverName).toBe("Informe o nome de quem recebeu.");
  });

  it("valor diferente do esperado exige confirmação", () => {
    expect(validateDeliveryDraft(draft({ cashCents: total - 100 }), ctx()).payment).toMatch(/diferente do esperado/);
    expect(validateDeliveryDraft(draft({ cashCents: total - 100, confirmDifferentAmount: true }), ctx())).toEqual({});
    expect(validateDeliveryDraft(draft({ cashCents: 10_000, pixCents: total - 10_000 }), ctx())).toEqual({});
  });

  it("faturado não recebe nada na entrega", () => {
    const faturado = ctx({ paymentMethod: "FATURADO", amountToCollectCents: 0 });
    expect(validateDeliveryDraft(draft({ cashCents: 0 }), faturado)).toEqual({});
    expect(validateDeliveryDraft(draft({ cashCents: 100, confirmDifferentAmount: true }), faturado).payment).toBe("Pedido faturado: não cobrar na entrega.");
  });

  it("parcial: limites por item, inteiro fora de KG, motivo da devolução e valor recalculado", () => {
    const expected = 10_980 + 6_435;
    expect(validateDeliveryDraft({ ...partial(20_000, 1_500), cashCents: expected }, ctx())).toEqual({});
    expect(validateDeliveryDraft({ ...partial(20_000, 1_500), cashCents: total }, ctx()).payment).toMatch(/diferente/);
    expect(validateDeliveryDraft({ ...partial(25_000, 1_500), cashCents: expected }, ctx())["item-leite"]).toBe("No máximo 24 UN.");
    expect(validateDeliveryDraft({ ...partial(20_500, 1_500), cashCents: expected }, ctx())["item-leite"]).toBe("Quantidade em UN deve ser um número inteiro.");
    expect(validateDeliveryDraft({ ...partial(20_000, 1_500, { leite: "Avaria" }), cashCents: expected }, ctx())["reason-queijo"]).toBe("Informe o motivo da devolução.");
    expect(validateDeliveryDraft({ ...partial(24_000, 2_750), cashCents: total }, ctx()).outcome).toMatch(/escolha "Entregue"/);
    expect(validateDeliveryDraft({ ...partial(0, 0), cashCents: 0 }, ctx()).outcome).toMatch(/escolha "Não entregue"/);
  });

  it("não entregue: motivo obrigatório, sem recebimento e sem vasilhame deixado", () => {
    const base = draft({ outcome: "NAO_ENTREGUE", cashCents: 0, receiverName: null, hasSignature: false, containers: [{ containerProductId: "caixa", delivered: 0, returned: 2 }] });
    expect(validateDeliveryDraft(base, ctx()).failureReason).toBe("Escolha o motivo.");
    expect(validateDeliveryDraft({ ...base, failureReason: "ESTABELECIMENTO_FECHADO" }, ctx())).toEqual({});
    expect(validateDeliveryDraft({ ...base, failureReason: "OUTRO", cashCents: 100 }, ctx()).payment).toBe("Entrega não feita não tem recebimento.");
    expect(validateDeliveryDraft({ ...base, failureReason: "OUTRO", containers: [{ containerProductId: "caixa", delivered: 1, returned: 0 }] }, ctx()).containers).toBe("Entrega não feita não deixa vasilhame.");
  });

  it("fotos e vasilhames dentro dos limites", () => {
    expect(validateDeliveryDraft(draft({ photoCount: 4 }), ctx()).photos).toBe("No máximo 3 fotos.");
    expect(validateDeliveryDraft(draft({ containers: [{ containerProductId: "caixa", delivered: -1, returned: 0 }] }), ctx()).containers).toBe("Quantidade de vasilhames inválida.");
    expect(
      validateDeliveryDraft(
        draft({
          containers: [
            { containerProductId: "caixa", delivered: 1, returned: 0 },
            { containerProductId: "caixa", delivered: 1, returned: 0 },
          ],
        }),
        ctx(),
      ).containers,
    ).toBe("Vasilhame repetido.");
  });
});
