// Finalização de entrega (seção 5.7, "Fila offline e sincronização", passos 2a a 2d).
//
// - presign: valida sessão, rota, tipo, tamanho e quantidade; cria os FileObject PENDING e
//   devolve URLs PUT de 10 minutos. Os arquivos vão do celular direto para o storage.
// - finalizar: confere cada arquivo no storage (HeadObject), grava comprovante, itens entregues,
//   movimentos de vasilhame, situação do pedido e, na última parada, a rota, em UMA transação.
// - Reenvio com o mesmo clientRequestId devolve o resultado original sem gravar nada.
//
// Plano em atraso não bloqueia nada aqui (decisão do dono do produto; seção 4, Company).

import "server-only";

import {
  type DeliveryLine,
  type DeliveryOutcome,
  amountToCollectAfterDelivery,
  deliveredQuantities,
  paymentStatusAfterDelivery,
  validateDeliveryDraft,
} from "../../domain/delivery";
import { decimalStringToMilli, milliToDecimalString } from "../../domain/quantity";
import type { RouteStatus } from "../../domain/route-status";
import { type ServiceContext, assertCan } from "../auth/context";
import { seesOnlyOwnRoutes } from "../auth/permissions";
import { ServiceError, notFound, prismaErrorCode } from "../errors";
import { createUploadUrl, statObject } from "../storage";
import { buildProofFileKey, isKeyOfCompany } from "../storage/keys";
import { type TenantDb, getTenantDb } from "../tenant-db";
import type { FinalizeDeliveryData, PresignData } from "../validation/deliveries";
import { DRIVER_MESSAGES } from "./driver-routes";

export const DELIVERY_MESSAGES = {
  ...DRIVER_MESSAGES,
  missingFile: "Um arquivo do comprovante não chegou ao armazenamento. O celular vai enviá-lo de novo.",
  badFile: "Arquivo do comprovante inválido.",
  otherProof: "Esta parada já foi finalizada em outro envio.",
  badContainer: "Vasilhame que não está cadastrado.",
} as const;

/** Código de erro que o celular trata como "envie os arquivos de novo". */
export const MISSING_FILE_CODE = "ARQUIVO";

export class MissingFileError extends ServiceError {
  constructor() {
    super("VALIDACAO", DELIVERY_MESSAGES.missingFile);
  }
}

export type DeliveryResult = { orderId: string; outcome: DeliveryOutcome; routeStatus: RouteStatus; alreadyProcessed: boolean };

/** Pedido que o usuário pode finalizar agora: rota em andamento, dele (ou ADMIN), ainda EM_ROTA. */
async function loadDeliverableOrder(db: TenantDb, ctx: ServiceContext, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      customerId: true,
      paymentMethod: true,
      amountToCollectCents: true,
      routeId: true,
      route: { select: { id: true, status: true, driverId: true } },
      deliveryProof: { select: { id: true } },
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          unit: true,
          quantity: true,
          unitPriceCents: true,
          product: { select: { unitsPerContainer: true, containerProduct: { select: { id: true, sku: true, name: true } } } },
        },
      },
    },
  });
  // Pedido de outra empresa, de rota alheia ou fora de rota: não existe para este usuário.
  if (!order || !order.route || (seesOnlyOwnRoutes(ctx.role) && order.route.driverId !== ctx.userId)) throw notFound();
  if (order.route.status === "LIBERADA_CARGA") throw new ServiceError("VALIDACAO", DRIVER_MESSAGES.notStarted);
  if (order.route.status !== "EM_ANDAMENTO") throw new ServiceError("CONFLITO", DRIVER_MESSAGES.notInProgress);
  if (order.deliveryProof) throw new ServiceError("CONFLITO", DELIVERY_MESSAGES.otherProof);
  if (order.status !== "EM_ROTA") throw new ServiceError("CONFLITO", DRIVER_MESSAGES.stopDone);
  return { ...order, route: order.route };
}

export type PresignResult =
  | { status: "ja-processado"; result: DeliveryResult }
  | { status: "ok"; uploads: Array<{ key: string; url: string; headers: Record<string, string> }> };

export async function presignProofUploads(ctx: ServiceContext, data: PresignData): Promise<PresignResult> {
  assertCan(ctx, "entregas.registrar");
  const db = getTenantDb(ctx);
  const previous = await findPrevious(db, ctx, data.clientRequestId);
  if (previous) return { status: "ja-processado", result: previous };
  const order = await loadDeliverableOrder(db, ctx, data.orderId);

  const planned = data.files.map((file) => ({ ...file, key: buildProofFileKey({ companyId: ctx.companyId, orderId: order.id, contentType: file.contentType }) }));
  await db.fileObject.createMany({
    data: planned.map((file) => ({ companyId: ctx.companyId, key: file.key, kind: file.kind, mimeType: file.contentType, sizeBytes: file.sizeBytes, uploadedById: ctx.userId })),
  });
  const uploads = await Promise.all(
    planned.map(async (file) => {
      const upload = await createUploadUrl({ companyId: ctx.companyId, key: file.key, contentType: file.contentType, sizeBytes: file.sizeBytes });
      return { key: file.key, url: upload.url, headers: upload.headers };
    }),
  );
  return { status: "ok", uploads };
}

async function findPrevious(db: TenantDb, ctx: ServiceContext, clientRequestId: string): Promise<DeliveryResult | null> {
  const proof = await db.deliveryProof.findUnique({
    where: { companyId_clientRequestId: { companyId: ctx.companyId, clientRequestId } },
    select: { orderId: true, outcome: true, order: { select: { route: { select: { status: true } } } } },
  });
  if (!proof) return null;
  return { orderId: proof.orderId, outcome: proof.outcome, routeStatus: proof.order.route?.status ?? "AGUARDANDO_ACERTO", alreadyProcessed: true };
}

/** Confere no banco e no storage cada arquivo citado no comprovante. */
async function assertProofFiles(db: TenantDb, ctx: ServiceContext, orderId: string, files: Array<{ key: string; kind: "PHOTO" | "SIGNATURE" }>): Promise<void> {
  if (new Set(files.map((file) => file.key)).size !== files.length) throw new ServiceError("VALIDACAO", DELIVERY_MESSAGES.badFile);
  const prefix = `companies/${ctx.companyId}/proofs/${orderId}/`;
  for (const file of files) {
    // Chave de outra empresa ou de outro pedido nunca é aceita (e nem chega ao storage).
    if (!isKeyOfCompany(file.key, ctx.companyId) || !file.key.startsWith(prefix)) throw new ServiceError("VALIDACAO", DELIVERY_MESSAGES.badFile);
  }
  const records = await db.fileObject.findMany({ where: { key: { in: files.map((file) => file.key) } }, select: { key: true, kind: true, mimeType: true, sizeBytes: true, status: true } });
  const byKey = new Map(records.map((record) => [record.key, record]));
  for (const file of files) {
    const record = byKey.get(file.key);
    if (!record || record.kind !== file.kind || record.status !== "PENDING") throw new ServiceError("VALIDACAO", DELIVERY_MESSAGES.badFile);
    const stored = await statObject({ companyId: ctx.companyId, key: file.key });
    if (!stored) throw new MissingFileError();
    if (stored.sizeBytes !== record.sizeBytes || stored.contentType !== record.mimeType) throw new ServiceError("VALIDACAO", DELIVERY_MESSAGES.badFile);
  }
}

export async function finalizeDelivery(ctx: ServiceContext, data: FinalizeDeliveryData, now: Date = new Date()): Promise<DeliveryResult> {
  assertCan(ctx, "entregas.registrar");
  const db = getTenantDb(ctx);
  const previous = await findPrevious(db, ctx, data.clientRequestId);
  if (previous) return previous;

  const order = await loadDeliverableOrder(db, ctx, data.orderId);
  const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { proofPolicy: true } });
  const lines: DeliveryLine[] = order.items.map((item) => {
    const container = item.product.containerProduct;
    return {
      orderItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      unit: item.unit,
      quantityMilli: decimalStringToMilli(item.quantity.toString()),
      unitPriceCents: item.unitPriceCents,
      container: container ? { productId: container.id, sku: container.sku, name: container.name, unitsPerContainer: item.product.unitsPerContainer } : null,
    };
  });

  const draft = { ...data, hasSignature: data.signatureKey !== null, photoCount: data.photoKeys.length };
  const errors = validateDeliveryDraft(draft, { lines, paymentMethod: order.paymentMethod, proofPolicy: company.proofPolicy, amountToCollectCents: order.amountToCollectCents });
  const firstError = Object.values(errors).find(Boolean);
  if (firstError) throw new ServiceError("VALIDACAO", firstError);

  const containerIds = data.containers.map((container) => container.containerProductId);
  if (containerIds.length > 0) {
    const valid = await db.product.count({ where: { id: { in: containerIds }, isReturnableContainer: true } });
    if (valid !== new Set(containerIds).size) throw new ServiceError("VALIDACAO", DELIVERY_MESSAGES.badContainer);
  }

  const files = [...(data.signatureKey ? [{ key: data.signatureKey, kind: "SIGNATURE" as const }] : []), ...data.photoKeys.map((key) => ({ key, kind: "PHOTO" as const }))];
  await assertProofFiles(db, ctx, order.id, files);

  const delivered = deliveredQuantities(data, lines);
  const amountToCollectCents = amountToCollectAfterDelivery({ outcome: data.outcome, paymentMethod: order.paymentMethod, currentAmountCents: order.amountToCollectCents, lines, delivered });
  const paymentStatus = paymentStatusAfterDelivery({ paymentMethod: order.paymentMethod, outcome: data.outcome, cashCents: data.cashCents, pixCents: data.pixCents });
  const reasons = new Map(data.items.map((item) => [item.orderItemId, item.returnReason]));
  // Relógio do celular adiantado não pode gravar entrega no futuro.
  const deliveredAt = new Date(Math.min(new Date(data.deliveredAt).getTime(), now.getTime()));

  try {
    return await db.$transaction(
      async (tx) => {
        await tx.deliveryProof.create({
          data: {
            companyId: ctx.companyId,
            orderId: order.id,
            clientRequestId: data.clientRequestId,
            outcome: data.outcome,
            deliveredAt,
            receivedAt: now,
            receiverName: data.outcome === "NAO_ENTREGUE" ? null : data.receiverName,
            receiverDocument: data.outcome === "NAO_ENTREGUE" ? null : data.receiverDocument,
            signatureFileKey: data.signatureKey,
            photoFileKeys: data.photoKeys,
            failureReason: data.outcome === "NAO_ENTREGUE" ? data.failureReason : null,
            failureNote: data.outcome === "NAO_ENTREGUE" ? data.failureNote : null,
            cashCollectedCents: data.cashCents,
            pixCollectedCents: data.pixCents,
            latitude: data.location?.latitude ?? null,
            longitude: data.location?.longitude ?? null,
            accuracyMeters: data.location?.accuracyMeters ?? null,
            recordedById: ctx.userId,
          },
        });
        if (files.length > 0) {
          const confirmed = await tx.fileObject.updateMany({ where: { key: { in: files.map((file) => file.key) }, status: "PENDING" }, data: { status: "CONFIRMED", confirmedAt: now } });
          if (confirmed.count !== files.length) throw new ServiceError("VALIDACAO", DELIVERY_MESSAGES.badFile);
        }
        for (const line of lines) {
          const quantity = delivered.get(line.orderItemId) ?? 0;
          await tx.orderItem.updateMany({
            where: { id: line.orderItemId },
            data: {
              deliveredQuantity: milliToDecimalString(quantity),
              returnReason: data.outcome === "ENTREGUE_PARCIAL" && quantity < line.quantityMilli ? (reasons.get(line.orderItemId) ?? null) : null,
            },
          });
        }
        const updated = await tx.order.updateMany({
          where: { id: order.id, status: "EM_ROTA", routeId: order.route.id },
          data: { status: data.outcome, paymentStatus, amountToCollectCents, version: { increment: 1 } },
        });
        if (updated.count === 0) throw new ServiceError("CONFLITO", DRIVER_MESSAGES.stopDone);
        const movements = data.containers.filter((container) => container.delivered > 0 || container.returned > 0);
        if (movements.length > 0) {
          await tx.containerMovement.createMany({
            data: movements.map((container) => ({
              companyId: ctx.companyId,
              customerId: order.customerId,
              containerProductId: container.containerProductId,
              orderId: order.id,
              routeId: order.route.id,
              delivered: container.delivered,
              returned: container.returned,
            })),
          });
        }
        await tx.auditLog.create({
          data: {
            companyId: ctx.companyId,
            userId: ctx.userId,
            entity: "Order",
            entityId: order.id,
            action: "ENTREGA_FINALIZADA",
            before: { status: "EM_ROTA", amountToCollectCents: order.amountToCollectCents },
            after: { status: data.outcome, paymentStatus, amountToCollectCents, cashCents: data.cashCents, pixCents: data.pixCents, clientRequestId: data.clientRequestId },
          },
        });

        // Última parada com desfecho: a rota vai para o acerto (seção 3.8).
        let routeStatus: RouteStatus = "EM_ANDAMENTO";
        const open = await tx.order.count({ where: { routeId: order.route.id, status: "EM_ROTA" } });
        if (open === 0) {
          await tx.route.updateMany({ where: { id: order.route.id, status: "EM_ANDAMENTO" }, data: { status: "AGUARDANDO_ACERTO", finishedAt: now, version: { increment: 1 } } });
          routeStatus = "AGUARDANDO_ACERTO";
        }
        return { orderId: order.id, outcome: data.outcome, routeStatus, alreadyProcessed: false };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (error) {
    // Dois envios iguais ao mesmo tempo: o segundo devolve o resultado do primeiro.
    if (prismaErrorCode(error) === "P2002") {
      const again = await findPrevious(db, ctx, data.clientRequestId);
      if (again) return again;
      throw new ServiceError("CONFLITO", DELIVERY_MESSAGES.otherProof);
    }
    throw error;
  }
}

