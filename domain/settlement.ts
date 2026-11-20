// Fechamento e acerto da rota (seção 5.8). Módulo puro: mercadoria, dinheiro, Pix, vasilhames e
// pendências, a partir dos pedidos, comprovantes e movimentos de vasilhame da rota.

import { calcContainersByOrder } from "./cargo-manifest";
import { formatCents } from "./money";
import type { OrderStatus } from "./order-status";
import type { PaymentMethod, PaymentStatus } from "./payment";
import type { ProductUnit } from "./quantity";

export type SettlementItem = {
  productId: string;
  sku: string;
  productName: string;
  unit: ProductUnit;
  quantityMilli: number;
  /** Nulo enquanto a parada não tem desfecho. */
  deliveredMilli: number | null;
  container: { productId: string; sku: string; name: string; unitsPerContainer: number | null } | null;
};

export type SettlementOrder = {
  orderId: string;
  orderNumber: number;
  stopSequence: number;
  customerName: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountToCollectCents: number;
  items: ReadonlyArray<SettlementItem>;
  /** Valores registrados pelo motorista no comprovante. */
  proof: { cashCents: number; pixCents: number } | null;
};

export type SettlementMovement = { containerProductId: string; sku: string; name: string; delivered: number; returned: number };

export type GoodsLine = {
  productId: string;
  sku: string;
  productName: string;
  unit: ProductUnit;
  loadedMilli: number;
  deliveredMilli: number;
  /** Voltou para o depósito: parcial + não entregue. */
  returnedMilli: number;
  /** Ainda sem desfecho (rota em andamento). */
  openMilli: number;
};

export type MoneySummary = {
  /** Soma do valor a cobrar dos pedidos entregues (inclusive parciais). */
  expectedCents: number;
  cashCents: number;
  pixInformedCents: number;
  pixConfirmedCents: number;
  pixPendingCents: number;
  /** Dinheiro + Pix já conferido (seção 5.8: Pix só conta depois da conferência). */
  receivedCents: number;
  cashHandedInCents: number | null;
  /**
   * Sobra (positivo) ou falta (negativo): dinheiro entregue no caixa − (esperado − Pix
   * informado). Decisão do dono do produto. Nulo enquanto o caixa não foi informado.
   */
  differenceCents: number | null;
};

export type PixLine = { orderId: string; orderNumber: number; stopSequence: number; customerName: string; amountCents: number; confirmed: boolean };

export type ContainerLine = {
  productId: string;
  sku: string;
  name: string;
  /** Saíram no caminhão (pela quantidade pedida). */
  out: number;
  /** Deixados com os clientes. */
  left: number;
  /** Recolhidos dos clientes. */
  collected: number;
  /** Devem voltar ao depósito: saíram − deixados + recolhidos. */
  backToDepot: number;
  /** Saldo da rota com os clientes: deixados − recolhidos. */
  withCustomers: number;
};

export type Settlement = {
  goods: GoodsLine[];
  money: MoneySummary;
  pix: PixLine[];
  containers: ContainerLine[];
  /** Paradas sem desfecho registrado no servidor. */
  openStops: number;
};

const DELIVERED: ReadonlyArray<OrderStatus> = ["ENTREGUE", "ENTREGUE_PARCIAL"];
const FINAL: ReadonlyArray<OrderStatus> = ["ENTREGUE", "ENTREGUE_PARCIAL", "NAO_ENTREGUE"];

export function isDeliveredStatus(status: OrderStatus): boolean {
  return DELIVERED.includes(status);
}

export function calcDifferenceCents(params: { cashHandedInCents: number; expectedCents: number; pixInformedCents: number }): number {
  return params.cashHandedInCents - (params.expectedCents - params.pixInformedCents);
}

/** "Sobra de R$ 9,24", "Falta de R$ 1,76" ou "Sem diferença": sempre em texto, não só em cor. */
export function differenceLabel(cents: number): string {
  if (cents === 0) return "Sem diferença";
  return cents > 0 ? `Sobra de ${formatCents(cents)}` : `Falta de ${formatCents(-cents)}`;
}

function bySku<T extends { sku: string }>(lines: T[]): T[] {
  return lines.sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR"));
}

export function buildSettlement(params: { orders: ReadonlyArray<SettlementOrder>; movements: ReadonlyArray<SettlementMovement>; cashHandedInCents: number | null }): Settlement {
  const goods = new Map<string, GoodsLine>();
  for (const order of params.orders) {
    const final = FINAL.includes(order.status);
    for (const item of order.items) {
      const line = goods.get(item.productId) ?? { productId: item.productId, sku: item.sku, productName: item.productName, unit: item.unit, loadedMilli: 0, deliveredMilli: 0, returnedMilli: 0, openMilli: 0 };
      line.loadedMilli += item.quantityMilli;
      if (!final) {
        line.openMilli += item.quantityMilli;
      } else {
        const delivered = order.status === "NAO_ENTREGUE" ? 0 : (item.deliveredMilli ?? item.quantityMilli);
        line.deliveredMilli += delivered;
        line.returnedMilli += item.quantityMilli - delivered;
      }
      goods.set(item.productId, line);
    }
  }

  let expectedCents = 0;
  let cashCents = 0;
  let pixInformedCents = 0;
  let pixConfirmedCents = 0;
  const pix: PixLine[] = [];
  for (const order of params.orders) {
    if (isDeliveredStatus(order.status)) expectedCents += order.amountToCollectCents;
    if (!order.proof) continue;
    cashCents += order.proof.cashCents;
    pixInformedCents += order.proof.pixCents;
    if (order.proof.pixCents > 0) {
      const confirmed = order.paymentStatus === "RECEBIDO";
      if (confirmed) pixConfirmedCents += order.proof.pixCents;
      pix.push({ orderId: order.orderId, orderNumber: order.orderNumber, stopSequence: order.stopSequence, customerName: order.customerName, amountCents: order.proof.pixCents, confirmed });
    }
  }

  // Vasilhames que saíram: pela quantidade pedida, como no romaneio de carga.
  const out = calcContainersByOrder(
    params.orders.flatMap((order) =>
      order.items.map((item) => ({ orderId: order.orderId, productId: item.productId, sku: item.sku, productName: item.productName, unit: item.unit, quantityMilli: item.quantityMilli, unitWeightGrams: null, container: item.container })),
    ),
  );
  const containers = new Map<string, ContainerLine>();
  const ensure = (productId: string, sku: string, name: string) => {
    const line = containers.get(productId) ?? { productId, sku, name, out: 0, left: 0, collected: 0, backToDepot: 0, withCustomers: 0 };
    containers.set(productId, line);
    return line;
  };
  for (const lines of out.values()) for (const line of lines) ensure(line.productId, line.sku, line.name).out += line.count;
  for (const movement of params.movements) {
    const line = ensure(movement.containerProductId, movement.sku, movement.name);
    line.left += movement.delivered;
    line.collected += movement.returned;
  }
  for (const line of containers.values()) {
    line.backToDepot = line.out - line.left + line.collected;
    line.withCustomers = line.left - line.collected;
  }

  return {
    goods: bySku([...goods.values()]),
    money: {
      expectedCents,
      cashCents,
      pixInformedCents,
      pixConfirmedCents,
      pixPendingCents: pixInformedCents - pixConfirmedCents,
      receivedCents: cashCents + pixConfirmedCents,
      cashHandedInCents: params.cashHandedInCents,
      differenceCents: params.cashHandedInCents === null ? null : calcDifferenceCents({ cashHandedInCents: params.cashHandedInCents, expectedCents, pixInformedCents }),
    },
    pix: pix.sort((a, b) => a.stopSequence - b.stopSequence),
    containers: bySku([...containers.values()]),
    openStops: params.orders.filter((order) => !FINAL.includes(order.status)).length,
  };
}
