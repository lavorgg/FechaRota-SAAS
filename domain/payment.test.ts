import { describe, expect, it } from "vitest";

import { calcAmountToCollectCents, initialPaymentStatus, isCollectedOnDelivery } from "./payment";

describe("valor a cobrar na entrega", () => {
  it("PIX e DINHEIRO cobram o total", () => {
    expect(calcAmountToCollectCents("PIX", 12345)).toBe(12345);
    expect(calcAmountToCollectCents("DINHEIRO", 12345)).toBe(12345);
  });

  it("BOLETO e FATURADO não cobram nada", () => {
    expect(calcAmountToCollectCents("BOLETO", 12345)).toBe(0);
    expect(calcAmountToCollectCents("FATURADO", 12345)).toBe(0);
  });

  it("recusa total inválido", () => {
    expect(() => calcAmountToCollectCents("PIX", -1)).toThrow();
    expect(() => calcAmountToCollectCents("PIX", 10.5)).toThrow();
  });

  it("situação inicial do pagamento", () => {
    expect(initialPaymentStatus("PIX")).toBe("A_RECEBER");
    expect(initialPaymentStatus("DINHEIRO")).toBe("A_RECEBER");
    expect(initialPaymentStatus("BOLETO")).toBe("FATURADO");
    expect(initialPaymentStatus("FATURADO")).toBe("FATURADO");
    expect(isCollectedOnDelivery("PIX")).toBe(true);
    expect(isCollectedOnDelivery("BOLETO")).toBe(false);
  });
});
