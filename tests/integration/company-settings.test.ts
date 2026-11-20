// Configurações de operação da empresa: fuso, política de comprovante e retenção.
// Decisões do dono do produto: retenção de 3 a 60 meses, com prévia ao reduzir; a política de
// comprovante vale para as rotas iniciadas depois da mudança.

import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { todayInTimeZone } from "@/domain/dates";
import { COUNTER_KEYS } from "@/lib/counters";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { countFilesBeyondRetention, getCompanySettings, updateCompanySettings } from "@/lib/services/company";
import { finalizeDelivery, presignProofUploads } from "@/lib/services/deliveries";
import { getDriverRouteBundle, startDriverRoute } from "@/lib/services/driver-routes";
import { createOrder } from "@/lib/services/orders";
import { createRoute, releaseRoute } from "@/lib/services/routes";
import { buildProofFileKey } from "@/lib/storage/keys";
import { finalizeDeliverySchema, presignSchema } from "@/lib/validation/deliveries";
import { createOrderSchema } from "@/lib/validation/orders";
import { companySettingsSchema, createRouteSchema } from "@/lib/validation/routes";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

const today = todayInTimeZone("America/Sao_Paulo");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
let a: CompanyFixture;
let b: CompanyFixture;

const settings = (overrides: Record<string, unknown> = {}) =>
  companySettingsSchema.parse({ name: "Empresa A", timezone: "America/Sao_Paulo", proofPolicy: "PHOTO_OR_SIGNATURE", fileRetentionMonths: "12", ...overrides });

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

/** Rota liberada com um pedido de hoje para o motorista da fixture. */
async function releasedRoute(name: string) {
  const order = await createOrder(contextOf(a.admin), createOrderSchema.parse({ customerId: a.customer.id, deliveryDate: today, paymentMethod: "FATURADO", items: [{ productId: a.product.id, quantity: "12" }], confirmDuplicate: true }));
  const route = await createRoute(contextOf(a.admin), createRouteSchema.parse({ deliveryDate: today, name, driverId: a.driver.id, vehicleId: null, orderIds: [order.id] }));
  await releaseRoute(contextOf(a.admin), route);
  return { routeId: route.id, orderId: order.id };
}

/** Entrega só com foto (sem assinatura). */
async function deliverWithPhotoOnly(orderId: string) {
  const clientRequestId = randomUUID();
  const presign = await presignProofUploads(contextOf(a.driver), presignSchema.parse({ clientRequestId, orderId, files: [{ kind: "PHOTO", contentType: "image/jpeg", sizeBytes: jpeg.byteLength }] }));
  if (presign.status !== "ok" || !presign.uploads[0]) throw new Error("presign");
  const upload = presign.uploads[0];
  await fetch(upload.url, { method: "PUT", body: new Blob([jpeg]), headers: upload.headers });
  return finalizeDelivery(
    contextOf(a.driver),
    finalizeDeliverySchema.parse({ clientRequestId, orderId, outcome: "ENTREGUE", deliveredAt: new Date().toISOString(), items: [], failureReason: null, failureNote: null, cashCents: 0, pixCents: 0, confirmDifferentAmount: false, containers: [], receiverName: "Recebedor", receiverDocument: null, signatureKey: null, photoKeys: [upload.key], location: null }),
  );
}

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
  await prisma.companyCounter.create({ data: { companyId: a.companyId, key: COUNTER_KEYS.route, value: 1 } });
});

describe("fuso, política e retenção", () => {
  it("ADMIN altera; valores ficam no cadastro e na auditoria; outra empresa não muda", async () => {
    const saved = await updateCompanySettings(contextOf(a.admin), settings({ timezone: "America/Manaus", proofPolicy: "SIGNATURE_REQUIRED", fileRetentionMonths: "24" }));
    expect(saved).toMatchObject({ timezone: "America/Manaus", proofPolicy: "SIGNATURE_REQUIRED", fileRetentionMonths: 24 });
    expect(await getCompanySettings(contextOf(b.admin))).toMatchObject({ timezone: "America/Sao_Paulo", proofPolicy: "PHOTO_OR_SIGNATURE", fileRetentionMonths: 12 });
    expect(await prisma.auditLog.findFirstOrThrow({ where: { companyId: a.companyId, action: "EMPRESA_ALTERADA" } })).toMatchObject({
      before: { proofPolicy: "PHOTO_OR_SIGNATURE", fileRetentionMonths: 12 },
      after: { proofPolicy: "SIGNATURE_REQUIRED", fileRetentionMonths: 24 },
    });
    await updateCompanySettings(contextOf(a.admin), settings());
  });

  it("retenção de 3 a 60 meses; fuso só da lista do Brasil", () => {
    const issue = (overrides: Record<string, unknown>) => companySettingsSchema.safeParse({ name: "Empresa", timezone: "America/Sao_Paulo", proofPolicy: "PHOTO_OR_SIGNATURE", fileRetentionMonths: "12", ...overrides }).error?.issues[0]?.message;
    expect(issue({ fileRetentionMonths: "2" })).toBe("A retenção mínima é de 3 meses.");
    expect(issue({ fileRetentionMonths: "61" })).toBe("A retenção máxima é de 60 meses.");
    expect(issue({ fileRetentionMonths: "12,5" })).toBeDefined();
    expect(issue({ timezone: "Europe/Lisbon" })).toBe("Escolha o fuso horário.");
    expect(issue({ proofPolicy: "NENHUMA" })).toBe("Escolha a política de comprovante.");
    expect(issue({ fileRetentionMonths: "3" })).toBeUndefined();
    expect(issue({ fileRetentionMonths: "60" })).toBeUndefined();
  });

  it("prévia ao reduzir a retenção: conta só arquivos confirmados, não apagados e da própria empresa", async () => {
    const now = new Date("2026-11-20T06:00:00Z");
    const file = (f: CompanyFixture, createdAt: string, extra: Record<string, unknown> = {}) =>
      prisma.fileObject.create({
        data: { companyId: f.companyId, key: buildProofFileKey({ companyId: f.companyId, orderId: f.order.id, contentType: "image/jpeg" }), kind: "PHOTO", mimeType: "image/jpeg", sizeBytes: 10, status: "CONFIRMED", uploadedById: f.driver.id, createdAt: new Date(createdAt), ...extra },
      });
    await file(a, "2026-01-10T00:00:00Z");
    await file(a, "2026-07-10T00:00:00Z");
    await file(a, "2026-01-10T00:00:00Z", { deletedAt: new Date() });
    await file(a, "2026-01-10T00:00:00Z", { status: "PENDING" });
    await file(b, "2026-01-10T00:00:00Z");
    // A fixture já tem a assinatura do comprovante, criada agora: nunca entra.
    expect(await countFilesBeyondRetention(contextOf(a.admin), 12, now)).toBe(0);
    expect(await countFilesBeyondRetention(contextOf(a.admin), 6, now)).toBe(1);
    expect(await countFilesBeyondRetention(contextOf(a.admin), 3, now)).toBe(2);
    expect((await rejection(countFilesBeyondRetention(contextOf(a.admin), 2, now))).code).toBe("VALIDACAO");
    const expedicao = { id: a.admin.id, companyId: a.companyId, role: "EXPEDICAO" as const };
    expect((await rejection(countFilesBeyondRetention(contextOf(expedicao), 6, now))).code).toBe("SEM_PERMISSAO");
  });
});

describe("política de comprovante vale para rotas iniciadas depois", () => {
  it("rota iniciada guarda a política; mudar depois não recusa as entregas dela", async () => {
    const first = await releasedRoute("Iniciada antes");
    // Antes de iniciar, o pacote mostra a política atual da empresa.
    expect((await getDriverRouteBundle(contextOf(a.driver), first.routeId)).company.proofPolicy).toBe("PHOTO_OR_SIGNATURE");
    await startDriverRoute(contextOf(a.driver), first.routeId);
    expect((await prisma.route.findUniqueOrThrow({ where: { id: first.routeId } })).proofPolicy).toBe("PHOTO_OR_SIGNATURE");

    await updateCompanySettings(contextOf(a.admin), settings({ proofPolicy: "SIGNATURE_REQUIRED" }));
    expect((await getDriverRouteBundle(contextOf(a.driver), first.routeId)).company.proofPolicy).toBe("PHOTO_OR_SIGNATURE");
    // Só com foto: a regra do início da rota aceita.
    expect((await deliverWithPhotoOnly(first.orderId)).outcome).toBe("ENTREGUE");
  });

  it("rota iniciada depois da mudança segue a regra nova", async () => {
    const second = await releasedRoute("Iniciada depois");
    await startDriverRoute(contextOf(a.driver), second.routeId);
    expect((await getDriverRouteBundle(contextOf(a.driver), second.routeId)).company.proofPolicy).toBe("SIGNATURE_REQUIRED");
    expect((await rejection(deliverWithPhotoOnly(second.orderId))).message).toBe("A assinatura do recebedor é obrigatória.");
  });
});
