// Números do dashboard (seção 5.3). Módulo puro: recebe os pedidos e rotas já carregados.
//
// Definições (documentadas aqui porque a especificação não detalha):
// - "A receber na entrega": soma do valor a cobrar de todos os pedidos da data, menos os
//   cancelados. BOLETO e FATURADO entram com zero.
// - "Recebido": dinheiro registrado no comprovante + Pix JÁ CONFIRMADO no extrato
//   (situação RECEBIDO). Pix informado e ainda não conferido fica em "Pix a conferir" e
//   não conta como recebido (seção 5.8).
// - Entregas concluídas = ENTREGUE + ENTREGUE_PARCIAL; pendentes = PENDENTE + EM_ROTA;
//   não entregues = NAO_ENTREGUE. Cancelados não entram em nenhuma das três.

import { ORDER_STATUSES, type OrderStatus } from "./order-status";
import type { PaymentStatus } from "./payment";
import { ROUTE_STATUSES, type RouteStatus } from "./route-status";

export type DashboardOrder = {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  amountToCollectCents: number;
  routeId: string | null;
  proof: { cashCollectedCents: number; pixCollectedCents: number } | null;
};

export type DashboardSummary = {
  orders: { total: number; byStatus: Record<OrderStatus, number> };
  money: {
    toCollectCents: number;
    receivedCents: number;
    receivedCashCents: number;
    receivedPixCents: number;
    pixToConfirmCents: number;
  };
  routes: { total: number; byStatus: Record<RouteStatus, number> };
  deliveries: { completed: number; pending: number; notDelivered: number };
  /** Pedidos PENDENTE da data que ainda não estão em nenhuma rota. */
  pendingWithoutRoute: number;
};

function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

export function summarizeDay(orders: ReadonlyArray<DashboardOrder>, routes: ReadonlyArray<{ status: RouteStatus }>): DashboardSummary {
  const byStatus = zeroed(ORDER_STATUSES);
  const money = { toCollectCents: 0, receivedCents: 0, receivedCashCents: 0, receivedPixCents: 0, pixToConfirmCents: 0 };
  let pendingWithoutRoute = 0;

  for (const order of orders) {
    byStatus[order.status] += 1;
    if (order.status === "CANCELADO") continue;

    money.toCollectCents += order.amountToCollectCents;
    if (order.status === "PENDENTE" && order.routeId === null) pendingWithoutRoute += 1;

    if (order.proof) {
      money.receivedCashCents += order.proof.cashCollectedCents;
      if (order.paymentStatus === "RECEBIDO") money.receivedPixCents += order.proof.pixCollectedCents;
      if (order.paymentStatus === "PIX_A_CONFERIR") money.pixToConfirmCents += order.proof.pixCollectedCents;
    }
  }
  money.receivedCents = money.receivedCashCents + money.receivedPixCents;

  const routesByStatus = zeroed(ROUTE_STATUSES);
  for (const route of routes) routesByStatus[route.status] += 1;

  return {
    orders: { total: orders.length, byStatus },
    money,
    routes: { total: routes.length, byStatus: routesByStatus },
    deliveries: {
      completed: byStatus.ENTREGUE + byStatus.ENTREGUE_PARCIAL,
      pending: byStatus.PENDENTE + byStatus.EM_ROTA,
      notDelivered: byStatus.NAO_ENTREGUE,
    },
    pendingWithoutRoute,
  };
}

export const SETTLEMENT_ALERT_HOURS = 12;

/**
 * Rota esperando acerto há mais de 12 horas. Conta a partir de `finishedAt` (fim das
 * entregas); se faltar, a partir da última alteração da rota.
 */
export function isSettlementOverdue(
  route: { status: RouteStatus; finishedAt: Date | null; updatedAt: Date },
  now: Date,
): boolean {
  if (route.status !== "AGUARDANDO_ACERTO") return false;
  const since = route.finishedAt ?? route.updatedAt;
  return now.getTime() - since.getTime() > SETTLEMENT_ALERT_HOURS * 60 * 60 * 1000;
}
