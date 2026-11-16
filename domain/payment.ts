// Regras financeiras do pedido (seção 4, Order).

export const PAYMENT_METHODS = ["PIX", "DINHEIRO", "BOLETO", "FATURADO"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["A_RECEBER", "RECEBIDO", "PIX_A_CONFERIR", "FATURADO", "NAO_RECEBIDO"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** PIX e DINHEIRO são cobrados pelo motorista na entrega. BOLETO e FATURADO não. */
export function isCollectedOnDelivery(method: PaymentMethod): boolean {
  return method === "PIX" || method === "DINHEIRO";
}

/** Valor que o motorista deve cobrar: o total, ou 0 quando é BOLETO ou FATURADO. */
export function calcAmountToCollectCents(method: PaymentMethod, totalCents: number): number {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new Error("Total inválido para cálculo do valor a cobrar.");
  }
  return isCollectedOnDelivery(method) ? totalCents : 0;
}

/** Situação de pagamento de um pedido recém-criado. */
export function initialPaymentStatus(method: PaymentMethod): PaymentStatus {
  return isCollectedOnDelivery(method) ? "A_RECEBER" : "FATURADO";
}

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  PIX: "Pix",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  FATURADO: "Faturado",
};

export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  A_RECEBER: "A receber",
  RECEBIDO: "Recebido",
  PIX_A_CONFERIR: "Pix a conferir",
  FATURADO: "Faturado",
  NAO_RECEBIDO: "Não recebido",
};
