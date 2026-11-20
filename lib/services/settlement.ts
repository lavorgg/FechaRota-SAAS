// Fechamento e acerto da rota (seção 5.8).
//
// Decisões do dono do produto:
// - sobra/falta = dinheiro entregue no caixa − (esperado − Pix informado);
// - Pix não conferido não impede concluir: continua "a conferir" e pode ser confirmado depois,
//   no fechamento da rota concluída;
// - o ADMIN corrige só os valores recebidos de uma parada, com motivo e auditoria.

import "server-only";

import { dbDateToDateString, formatInstant } from "../../domain/dates";
import { type DeliveryOutcome, type FailureReason, paymentStatusAfterDelivery } from "../../domain/delivery";
import type { OrderStatus } from "../../domain/order-status";
import { type PaymentMethod, type PaymentStatus, isCollectedOnDelivery } from "../../domain/payment";
import { decimalStringToMilli } from "../../domain/quantity";
import type { RouteStatus } from "../../domain/route-status";
import { type Settlement, buildSettlement, calcDifferenceCents, isDeliveredStatus } from "../../domain/settlement";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { MESSAGES, ServiceError, notFound } from "../errors";
import { createDownloadUrl } from "../storage";
import { type TenantDb, getTenantDb } from "../tenant-db";
import type { ConcludeSettlementData, PaymentCorrectionData, PixConfirmationData } from "../validation/settlement";

export const SETTLEMENT_MESSAGES = {
  notOpen: "O fechamento abre quando o motorista inicia a rota.",
  notAwaiting: "Só dá para concluir o acerto com todas as paradas registradas (rota aguardando acerto).",
  concluded: "Acerto já concluído: esta alteração não é mais possível.",
  noPix: "Este pedido não tem Pix informado.",
  notDelivered: "Só dá para corrigir valores de pedido entregue.",
  billed: "Pedido faturado ou em boleto não tem recebimento na entrega.",
  noProof: "Esta parada não tem comprovante.",
} as const;

const VIEWABLE: ReadonlyArray<RouteStatus> = ["EM_ANDAMENTO", "AGUARDANDO_ACERTO", "CONCLUIDA"];

/** Documento do recebedor nunca aparece inteiro (seção 6): só os 2 últimos caracteres. */
export function maskDocument(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, "");
  return clean.length <= 2 ? "••" : `${"•".repeat(Math.min(8, clean.length - 2))}${clean.slice(-2)}`;
}

export type SettlementStopDTO = {
  orderId: string;
  orderNumber: number;
  stopSequence: number;
  customerName: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountToCollectCents: number;
  rescheduledToNumber: number | null;
  returns: Array<{ productName: string; returnReason: string | null }>;
  proof: {
    outcome: DeliveryOutcome;
    deliveredAt: string;
    receiverName: string | null;
    receiverDocument: string | null;
    cashCents: number;
    pixCents: number;
    failureReason: FailureReason | null;
    failureNote: string | null;
    hasSignature: boolean;
    photoCount: number;
    location: { latitude: number; longitude: number } | null;
  } | null;
};

export type SettlementDTO = {
  route: {
    id: string;
    code: string;
    name: string;
    deliveryDate: string;
    status: RouteStatus;
    version: number;
    driverName: string;
    vehicle: { plate: string; model: string } | null;
    closedAt: string | null;
    closedByName: string | null;
  };
  companyName: string;
  settlement: Settlement;
  stops: SettlementStopDTO[];
  generatedAt: string;
};

async function loadRoute(db: TenantDb, routeId: string) {
  const route = await db.route.findUnique({
    where: { id: routeId },
    select: {
      id: true,
      code: true,
      name: true,
      deliveryDate: true,
      status: true,
      version: true,
      cashHandedInCents: true,
      closedAt: true,
      closedBy: { select: { name: true } },
      driver: { select: { name: true } },
      vehicle: { select: { plate: true, model: true } },
    },
  });
  if (!route) throw notFound();
  if (!VIEWABLE.includes(route.status)) throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.notOpen);
  return route;
}

export async function getSettlement(ctx: ServiceContext, routeId: string, now: Date = new Date()): Promise<SettlementDTO> {
  assertCan(ctx, "acerto.realizar");
  const db = getTenantDb(ctx);
  const route = await loadRoute(db, routeId);
  const [orders, movements, company] = await Promise.all([
    db.order.findMany({
      where: { routeId },
      select: {
        id: true,
        orderNumber: true,
        stopSequence: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        amountToCollectCents: true,
        customer: { select: { name: true } },
        rescheduledTo: { select: { orderNumber: true } },
        items: {
          select: {
            productId: true,
            productName: true,
            unit: true,
            quantity: true,
            deliveredQuantity: true,
            returnReason: true,
            product: { select: { sku: true, unitsPerContainer: true, containerProduct: { select: { id: true, sku: true, name: true } } } },
          },
          orderBy: { id: "asc" },
        },
        deliveryProof: {
          select: {
            outcome: true,
            deliveredAt: true,
            receiverName: true,
            receiverDocument: true,
            cashCollectedCents: true,
            pixCollectedCents: true,
            failureReason: true,
            failureNote: true,
            signatureFileKey: true,
            photoFileKeys: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: [{ stopSequence: "asc" }, { orderNumber: "asc" }],
    }),
    db.containerMovement.findMany({ where: { routeId }, select: { containerProductId: true, delivered: true, returned: true, containerProduct: { select: { sku: true, name: true } } } }),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true } }),
  ]);

  const settlement = buildSettlement({
    orders: orders.map((order, index) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      stopSequence: order.stopSequence ?? index + 1,
      customerName: order.customer.name,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      amountToCollectCents: order.amountToCollectCents,
      proof: order.deliveryProof ? { cashCents: order.deliveryProof.cashCollectedCents, pixCents: order.deliveryProof.pixCollectedCents } : null,
      items: order.items.map((item) => {
        const container = item.product.containerProduct;
        return {
          productId: item.productId,
          sku: item.product.sku,
          productName: item.productName,
          unit: item.unit,
          quantityMilli: decimalStringToMilli(item.quantity.toString()),
          deliveredMilli: item.deliveredQuantity === null ? null : decimalStringToMilli(item.deliveredQuantity.toString()),
          container: container ? { productId: container.id, sku: container.sku, name: container.name, unitsPerContainer: item.product.unitsPerContainer } : null,
        };
      }),
    })),
    movements: movements.map((movement) => ({ containerProductId: movement.containerProductId, sku: movement.containerProduct.sku, name: movement.containerProduct.name, delivered: movement.delivered, returned: movement.returned })),
    cashHandedInCents: route.cashHandedInCents,
  });

  return {
    route: {
      id: route.id,
      code: route.code,
      name: route.name,
      deliveryDate: dbDateToDateString(route.deliveryDate),
      status: route.status,
      version: route.version,
      driverName: route.driver.name,
      vehicle: route.vehicle,
      closedAt: route.closedAt ? formatInstant(route.closedAt, ctx.timezone) : null,
      closedByName: route.closedBy?.name ?? null,
    },
    companyName: company.name,
    settlement,
    stops: orders.map((order, index) => {
      const proof = order.deliveryProof;
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        stopSequence: order.stopSequence ?? index + 1,
        customerName: order.customer.name,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        amountToCollectCents: order.amountToCollectCents,
        rescheduledToNumber: order.rescheduledTo?.orderNumber ?? null,
        returns: order.items.filter((item) => item.returnReason).map((item) => ({ productName: item.productName, returnReason: item.returnReason })),
        proof: proof
          ? {
              outcome: proof.outcome,
              deliveredAt: formatInstant(proof.deliveredAt, ctx.timezone),
              receiverName: proof.receiverName,
              receiverDocument: maskDocument(proof.receiverDocument),
              cashCents: proof.cashCollectedCents,
              pixCents: proof.pixCollectedCents,
              failureReason: proof.failureReason,
              failureNote: proof.failureNote,
              hasSignature: proof.signatureFileKey !== null,
              photoCount: proof.photoFileKeys.length,
              location: proof.latitude !== null && proof.longitude !== null ? { latitude: proof.latitude, longitude: proof.longitude } : null,
            }
          : null,
      };
    }),
    generatedAt: formatInstant(now, ctx.timezone),
  };
}

export type ProofFilesDTO = { signatureUrl: string | null; photoUrls: string[]; removedByRetention: number };

/**
 * URLs GET de 5 minutos para assinatura e fotos de UMA parada, geradas só depois de conferir
 * sessão, permissão e empresa (seção 5.8). Arquivo apagado pela retenção não gera URL.
 */
export async function getProofFileUrls(ctx: ServiceContext, orderId: string): Promise<ProofFilesDTO> {
  assertCan(ctx, "acerto.realizar");
  const db = getTenantDb(ctx);
  const order = await db.order.findUnique({ where: { id: orderId }, select: { deliveryProof: { select: { signatureFileKey: true, photoFileKeys: true } } } });
  if (!order) throw notFound();
  const proof = order.deliveryProof;
  if (!proof) throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.noProof);
  const keys = [...(proof.signatureFileKey ? [proof.signatureFileKey] : []), ...proof.photoFileKeys];
  const live = new Set((await db.fileObject.findMany({ where: { key: { in: keys }, status: "CONFIRMED", deletedAt: null }, select: { key: true } })).map((file) => file.key));
  const url = (key: string) => createDownloadUrl({ companyId: ctx.companyId, key });
  return {
    signatureUrl: proof.signatureFileKey && live.has(proof.signatureFileKey) ? await url(proof.signatureFileKey) : null,
    photoUrls: await Promise.all(proof.photoFileKeys.filter((key) => live.has(key)).map(url)),
    removedByRetention: keys.filter((key) => !live.has(key)).length,
  };
}

async function loadOrderInRoute(db: TenantDb, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      version: true,
      route: { select: { status: true } },
      deliveryProof: { select: { id: true, outcome: true, cashCollectedCents: true, pixCollectedCents: true } },
    },
  });
  if (!order || !order.route || !VIEWABLE.includes(order.route.status)) throw notFound();
  return { ...order, route: order.route };
}

/** "Confirmado no extrato" (seção 5.8). Desmarcar só antes de concluir o acerto. */
export async function setPixConfirmation(ctx: ServiceContext, data: PixConfirmationData): Promise<void> {
  assertCan(ctx, "acerto.realizar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const order = await loadOrderInRoute(db, data.orderId);
  if (!order.deliveryProof || order.deliveryProof.pixCollectedCents <= 0) throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.noPix);
  if (!data.confirmed && order.route.status === "CONCLUIDA") throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.concluded);
  const from: PaymentStatus = data.confirmed ? "PIX_A_CONFERIR" : "RECEBIDO";
  const to: PaymentStatus = data.confirmed ? "RECEBIDO" : "PIX_A_CONFERIR";
  if (order.paymentStatus === to) return;

  await db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({ where: { id: order.id, paymentStatus: from }, data: { paymentStatus: to, version: { increment: 1 } } });
    if (updated.count === 0) throw new ServiceError("CONFLITO", MESSAGES.concurrentChange);
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entity: "Order",
        entityId: order.id,
        action: data.confirmed ? "PIX_CONFIRMADO" : "PIX_DESCONFIRMADO",
        before: { paymentStatus: from },
        after: { paymentStatus: to, pixCents: order.deliveryProof?.pixCollectedCents ?? 0 },
      },
    });
  });
}

/** Correção dos valores recebidos de uma parada (só ADMIN, com motivo; seção 3.8). */
export async function correctDeliveryPayment(ctx: ServiceContext, data: PaymentCorrectionData): Promise<void> {
  assertCan(ctx, "entregas.corrigir");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const order = await loadOrderInRoute(db, data.orderId);
  if (order.route.status === "CONCLUIDA") throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.concluded);
  if (!isDeliveredStatus(order.status) || !order.deliveryProof) throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.notDelivered);
  if (!isCollectedOnDelivery(order.paymentMethod) && (data.cashCents > 0 || data.pixCents > 0)) throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.billed);
  const proof = order.deliveryProof;
  const paymentStatus = paymentStatusAfterDelivery({ paymentMethod: order.paymentMethod, outcome: proof.outcome, cashCents: data.cashCents, pixCents: data.pixCents });

  await db.$transaction(async (tx) => {
    await tx.deliveryProof.updateMany({ where: { id: proof.id }, data: { cashCollectedCents: data.cashCents, pixCollectedCents: data.pixCents } });
    const updated = await tx.order.updateMany({ where: { id: order.id, version: order.version }, data: { paymentStatus, version: { increment: 1 } } });
    if (updated.count === 0) throw new ServiceError("CONFLITO", MESSAGES.concurrentChange);
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entity: "Order",
        entityId: order.id,
        action: "ENTREGA_CORRIGIDA",
        before: { cashCents: proof.cashCollectedCents, pixCents: proof.pixCollectedCents, paymentStatus: order.paymentStatus },
        after: { cashCents: data.cashCents, pixCents: data.pixCents, paymentStatus },
        reason: data.reason,
      },
    });
  });
}

/** "Concluir acerto": grava o caixa, registra os números na auditoria e conclui a rota. */
export async function concludeSettlement(ctx: ServiceContext, data: ConcludeSettlementData, now: Date = new Date()): Promise<void> {
  assertCan(ctx, "acerto.realizar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const current = await getSettlement(ctx, data.id, now);
  if (current.route.status === "CONCLUIDA") throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.concluded);
  if (current.route.status !== "AGUARDANDO_ACERTO") throw new ServiceError("VALIDACAO", SETTLEMENT_MESSAGES.notAwaiting);
  if (current.route.version !== data.version) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);
  const money = buildSettlementMoney(current.settlement, data.cashHandedInCents);

  await db.$transaction(async (tx) => {
    const updated = await tx.route.updateMany({
      where: { id: data.id, status: "AGUARDANDO_ACERTO", version: data.version },
      data: { status: "CONCLUIDA", cashHandedInCents: data.cashHandedInCents, closedAt: now, closedById: ctx.userId, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entity: "Route",
        entityId: data.id,
        action: "ACERTO_CONCLUIDO",
        before: { status: "AGUARDANDO_ACERTO" },
        after: { status: "CONCLUIDA", ...money, pixPendingCount: current.settlement.pix.filter((line) => !line.confirmed).length },
      },
    });
  });
}

function buildSettlementMoney(settlement: Settlement, cashHandedInCents: number) {
  const { expectedCents, cashCents, pixInformedCents, pixConfirmedCents } = settlement.money;
  return { expectedCents, cashCents, pixInformedCents, pixConfirmedCents, cashHandedInCents, differenceCents: calcDifferenceCents({ cashHandedInCents, expectedCents, pixInformedCents }) };
}
