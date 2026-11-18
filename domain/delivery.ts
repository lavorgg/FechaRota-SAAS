// Finalização de entrega pelo motorista (seção 5.7, "Comprovante"). Módulo puro: as mesmas
// regras validam o formulário no celular (sem sinal) e o envio no servidor.

import { calcContainersByOrder } from "./cargo-manifest";
import { type PaymentMethod, type PaymentStatus, isCollectedOnDelivery } from "./payment";
import { type ProductUnit, calcSubtotalCents, formatQuantity, validateQuantityForUnit } from "./quantity";

export const DELIVERY_OUTCOMES = ["ENTREGUE", "ENTREGUE_PARCIAL", "NAO_ENTREGUE"] as const;
export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

export const DELIVERY_OUTCOME_LABELS: Readonly<Record<DeliveryOutcome, string>> = {
  ENTREGUE: "Entregue",
  ENTREGUE_PARCIAL: "Entregue parcialmente",
  NAO_ENTREGUE: "Não entregue",
};

export const FAILURE_REASONS = ["ESTABELECIMENTO_FECHADO", "PEDIDO_RECUSADO", "ENDERECO_NAO_LOCALIZADO", "CLIENTE_SEM_DINHEIRO", "AVARIA", "OUTRO"] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const FAILURE_REASON_LABELS: Readonly<Record<FailureReason, string>> = {
  ESTABELECIMENTO_FECHADO: "Estabelecimento fechado",
  PEDIDO_RECUSADO: "Pedido recusado",
  ENDERECO_NAO_LOCALIZADO: "Endereço não localizado",
  CLIENTE_SEM_DINHEIRO: "Cliente sem dinheiro",
  AVARIA: "Avaria",
  OUTRO: "Outro",
};

export const PROOF_POLICIES = ["SIGNATURE_REQUIRED", "PHOTO_OR_SIGNATURE"] as const;
export type ProofPolicy = (typeof PROOF_POLICIES)[number];

/** Até 3 fotos por comprovante (seção 4, DeliveryProof). */
export const MAX_PROOF_PHOTOS = 3;
/** Limite de sanidade dos steppers de vasilhame. */
export const MAX_CONTAINERS_PER_STOP = 999;

export const TEXT_LIMITS = { receiverName: 120, receiverDocument: 20, failureNote: 500, returnReason: 200 } as const;

export type DeliveryLine = {
  orderItemId: string;
  productId: string;
  productName: string;
  unit: ProductUnit;
  quantityMilli: number;
  unitPriceCents: number;
  /** Vasilhame em que o produto sai, se houver. */
  container: { productId: string; sku: string; name: string; unitsPerContainer: number | null } | null;
};

export type DeliveryDraft = {
  outcome: DeliveryOutcome;
  /** Quantidade entregue por item. Só conta na entrega parcial. */
  items: ReadonlyArray<{ orderItemId: string; deliveredMilli: number; returnReason: string | null }>;
  failureReason: FailureReason | null;
  failureNote: string | null;
  cashCents: number;
  pixCents: number;
  /** O motorista confirmou que recebeu valor diferente do esperado. */
  confirmDifferentAmount: boolean;
  containers: ReadonlyArray<{ containerProductId: string; delivered: number; returned: number }>;
  receiverName: string | null;
  receiverDocument: string | null;
  hasSignature: boolean;
  photoCount: number;
};

export type DeliveryContext = {
  lines: ReadonlyArray<DeliveryLine>;
  paymentMethod: PaymentMethod;
  proofPolicy: ProofPolicy;
  /** Valor a cobrar gravado no pedido (antes desta entrega). */
  amountToCollectCents: number;
};

/** Quantidade entregue de cada item, conforme o desfecho. */
export function deliveredQuantities(draft: Pick<DeliveryDraft, "outcome" | "items">, lines: ReadonlyArray<DeliveryLine>): Map<string, number> {
  const typed = new Map(draft.items.map((item) => [item.orderItemId, item.deliveredMilli]));
  return new Map(
    lines.map((line) => {
      if (draft.outcome === "ENTREGUE") return [line.orderItemId, line.quantityMilli];
      if (draft.outcome === "NAO_ENTREGUE") return [line.orderItemId, 0];
      return [line.orderItemId, typed.get(line.orderItemId) ?? line.quantityMilli];
    }),
  );
}

/** Valor da mercadoria entregue: quantidade entregue × preço, arredondado por item (como o pedido). */
export function deliveredValueCents(lines: ReadonlyArray<DeliveryLine>, delivered: ReadonlyMap<string, number>): number {
  return lines.reduce((sum, line) => sum + calcSubtotalCents(delivered.get(line.orderItemId) ?? 0, line.unitPriceCents), 0);
}

/**
 * Valor a cobrar depois da entrega. Na parcial, é recalculado com o que foi entregue e substitui
 * o do pedido (decisão do dono do produto). Entregue: o do pedido. Não entregue: nada muda no
 * pedido, e o fechamento só soma o que foi entregue.
 */
export function amountToCollectAfterDelivery(params: {
  outcome: DeliveryOutcome;
  paymentMethod: PaymentMethod;
  currentAmountCents: number;
  lines: ReadonlyArray<DeliveryLine>;
  delivered: ReadonlyMap<string, number>;
}): number {
  if (params.outcome !== "ENTREGUE_PARCIAL") return params.currentAmountCents;
  return isCollectedOnDelivery(params.paymentMethod) ? deliveredValueCents(params.lines, params.delivered) : 0;
}

/** Valor que o motorista deve cobrar nesta parada, conforme o desfecho escolhido. */
export function expectedCollectionCents(params: { outcome: DeliveryOutcome; paymentMethod: PaymentMethod; currentAmountCents: number; lines: ReadonlyArray<DeliveryLine>; delivered: ReadonlyMap<string, number> }): number {
  if (params.outcome === "NAO_ENTREGUE") return 0;
  return amountToCollectAfterDelivery(params);
}

/**
 * Situação do pagamento depois da entrega.
 * - Boleto e faturado não são cobrados na entrega: continuam FATURADO.
 * - Não entregue: NAO_RECEBIDO.
 * - Algum Pix informado: PIX_A_CONFERIR (só vira recebido na conferência do acerto, seção 5.8).
 * - Só dinheiro: RECEBIDO. Nada recebido: NAO_RECEBIDO. A diferença aparece no fechamento.
 */
export function paymentStatusAfterDelivery(params: { paymentMethod: PaymentMethod; outcome: DeliveryOutcome; cashCents: number; pixCents: number }): PaymentStatus {
  if (!isCollectedOnDelivery(params.paymentMethod)) return "FATURADO";
  if (params.outcome === "NAO_ENTREGUE") return "NAO_RECEBIDO";
  if (params.pixCents > 0) return "PIX_A_CONFERIR";
  if (params.cashCents > 0) return "RECEBIDO";
  return "NAO_RECEBIDO";
}

/** Vasilhames que saem com o que foi entregue (pré-preenchimento do formulário). */
export function containersForDelivery(lines: ReadonlyArray<DeliveryLine>, delivered: ReadonlyMap<string, number>): Array<{ productId: string; sku: string; name: string; count: number }> {
  const byOrder = calcContainersByOrder(
    lines
      .filter((line) => line.container && (delivered.get(line.orderItemId) ?? 0) > 0)
      .map((line) => ({
        orderId: "parada",
        productId: line.productId,
        sku: "",
        productName: line.productName,
        unit: line.unit,
        quantityMilli: delivered.get(line.orderItemId) ?? 0,
        unitWeightGrams: null,
        container: line.container,
      })),
  );
  return byOrder.get("parada") ?? [];
}

export type DraftErrors = Partial<Record<string, string>>;

function textOk(value: string | null, max: number): boolean {
  return value === null || value.length <= max;
}

/** Valida o comprovante. Devolve os erros por campo (vazio = válido). */
export function validateDeliveryDraft(draft: DeliveryDraft, ctx: DeliveryContext): DraftErrors {
  const errors: DraftErrors = {};
  const delivered = deliveredQuantities(draft, ctx.lines);

  if (draft.outcome === "ENTREGUE_PARCIAL") {
    const linesById = new Map(ctx.lines.map((line) => [line.orderItemId, line]));
    for (const item of draft.items) {
      if (!linesById.has(item.orderItemId)) errors.items = "Item que não é deste pedido.";
    }
    let anyDelivered = false;
    let anyReturned = false;
    for (const line of ctx.lines) {
      const value = delivered.get(line.orderItemId) ?? 0;
      const key = `item-${line.orderItemId}`;
      if (!Number.isSafeInteger(value) || value < 0) {
        errors[key] = "Quantidade inválida.";
        continue;
      }
      if (value > line.quantityMilli) {
        errors[key] = `No máximo ${formatQuantity(line.quantityMilli)} ${line.unit}.`;
        continue;
      }
      if (value > 0) {
        const check = validateQuantityForUnit(value, line.unit);
        if (!check.ok) {
          errors[key] = check.error;
          continue;
        }
        anyDelivered = true;
      }
      if (value < line.quantityMilli) {
        anyReturned = true;
        const reason = draft.items.find((item) => item.orderItemId === line.orderItemId)?.returnReason?.trim() ?? "";
        if (!reason) errors[`reason-${line.orderItemId}`] = "Informe o motivo da devolução.";
        else if (reason.length > TEXT_LIMITS.returnReason) errors[`reason-${line.orderItemId}`] = "Motivo longo demais.";
      }
    }
    if (!anyDelivered) errors.outcome = "Nada foi entregue: escolha \"Não entregue\".";
    else if (!anyReturned) errors.outcome = "Tudo foi entregue: escolha \"Entregue\".";
  }

  if (draft.outcome === "NAO_ENTREGUE") {
    if (!draft.failureReason) errors.failureReason = "Escolha o motivo.";
    if (draft.cashCents !== 0 || draft.pixCents !== 0) errors.payment = "Entrega não feita não tem recebimento.";
    if (draft.containers.some((container) => container.delivered !== 0)) errors.containers = "Entrega não feita não deixa vasilhame.";
  } else {
    const name = draft.receiverName?.trim() ?? "";
    if (name.length < 2) errors.receiverName = "Informe o nome de quem recebeu.";
    if (ctx.proofPolicy === "SIGNATURE_REQUIRED" && !draft.hasSignature) errors.signature = "A assinatura do recebedor é obrigatória.";
    if (ctx.proofPolicy === "PHOTO_OR_SIGNATURE" && !draft.hasSignature && draft.photoCount === 0) errors.signature = "Colete a assinatura ou tire uma foto.";
  }

  if (!textOk(draft.receiverName, TEXT_LIMITS.receiverName)) errors.receiverName = "Nome longo demais.";
  if (!textOk(draft.receiverDocument, TEXT_LIMITS.receiverDocument)) errors.receiverDocument = "Documento longo demais.";
  if (!textOk(draft.failureNote, TEXT_LIMITS.failureNote)) errors.failureNote = "Observação longa demais.";
  if (!Number.isInteger(draft.photoCount) || draft.photoCount < 0 || draft.photoCount > MAX_PROOF_PHOTOS) errors.photos = `No máximo ${MAX_PROOF_PHOTOS} fotos.`;

  for (const value of [draft.cashCents, draft.pixCents]) {
    if (!Number.isSafeInteger(value) || value < 0) errors.payment = "Valor recebido inválido.";
  }
  if (draft.outcome !== "NAO_ENTREGUE" && !errors.payment) {
    if (!isCollectedOnDelivery(ctx.paymentMethod)) {
      if (draft.cashCents !== 0 || draft.pixCents !== 0) errors.payment = "Pedido faturado: não cobrar na entrega.";
    } else {
      const expected = expectedCollectionCents({ outcome: draft.outcome, paymentMethod: ctx.paymentMethod, currentAmountCents: ctx.amountToCollectCents, lines: ctx.lines, delivered });
      if (draft.cashCents + draft.pixCents !== expected && !draft.confirmDifferentAmount) {
        errors.payment = "O valor recebido é diferente do esperado. Confirme para seguir.";
      }
    }
  }

  const seen = new Set<string>();
  for (const container of draft.containers) {
    if (seen.has(container.containerProductId)) errors.containers = "Vasilhame repetido.";
    seen.add(container.containerProductId);
    for (const value of [container.delivered, container.returned]) {
      if (!Number.isInteger(value) || value < 0 || value > MAX_CONTAINERS_PER_STOP) errors.containers = "Quantidade de vasilhames inválida.";
    }
  }
  return errors;
}
