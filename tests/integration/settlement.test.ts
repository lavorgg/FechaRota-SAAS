// Fechamento e acerto (seção 5.8): números, Pix, correção pelo ADMIN, conclusão, comprovantes e
// isolamento entre empresas.

import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { todayInTimeZone } from "@/domain/dates";
import { COUNTER_KEYS } from "@/lib/counters";
import { prisma } from "@/lib/db";
import { MESSAGES, ServiceError } from "@/lib/errors";
import { finalizeDelivery, presignProofUploads } from "@/lib/services/deliveries";
import { startDriverRoute } from "@/lib/services/driver-routes";
import { createOrder } from "@/lib/services/orders";
import { createRoute, releaseRoute } from "@/lib/services/routes";
import { SETTLEMENT_MESSAGES, concludeSettlement, correctDeliveryPayment, getProofFileUrls, getSettlement, maskDocument, setPixConfirmation } from "@/lib/services/settlement";
import { finalizeDeliverySchema, presignSchema } from "@/lib/validation/deliveries";
import { createOrderSchema } from "@/lib/validation/orders";
import { createRouteSchema } from "@/lib/validation/routes";
import { paymentCorrectionSchema } from "@/lib/validation/settlement";
import { sampleSignaturePng } from "@/prisma/seed-support/png";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

const today = todayInTimeZone("America/Sao_Paulo");
const png = sampleSignaturePng(5);
let a: CompanyFixture;
let b: CompanyFixture;
let expedicao: { id: string; companyId: string; role: "EXPEDICAO" };
let routeId = "";
const orders: Record<"dinheiro" | "pix" | "faturado" | "naoEntregue", string> = { dinheiro: "", pix: "", faturado: "", naoEntregue: "" };

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

async function newOrder(paymentMethod: "DINHEIRO" | "PIX" | "FATURADO", quantity: string) {
  const saved = await createOrder(
    contextOf(a.admin),
    createOrderSchema.parse({ customerId: a.customer.id, deliveryDate: today, paymentMethod, items: [{ productId: a.product.id, quantity }], confirmDuplicate: true }),
  );
  return saved.id;
}

/** Entrega pelo caminho real: presign, upload da assinatura e finalização. */
async function deliver(orderId: string, overrides: Record<string, unknown>) {
  const clientRequestId = randomUUID();
  const presign = await presignProofUploads(contextOf(a.driver), presignSchema.parse({ clientRequestId, orderId, files: [{ kind: "SIGNATURE", contentType: "image/png", sizeBytes: png.byteLength }] }));
  if (presign.status !== "ok") throw new Error("presign");
  const upload = presign.uploads[0];
  if (!upload) throw new Error("upload");
  await fetch(upload.url, { method: "PUT", body: new Blob([new Uint8Array(png)]), headers: upload.headers });
  return finalizeDelivery(
    contextOf(a.driver),
    finalizeDeliverySchema.parse({
      clientRequestId,
      orderId,
      outcome: "ENTREGUE",
      deliveredAt: new Date().toISOString(),
      items: [],
      failureReason: null,
      failureNote: null,
      cashCents: 0,
      pixCents: 0,
      confirmDifferentAmount: false,
      containers: [],
      receiverName: "Recebedor",
      receiverDocument: "123.456.789-09",
      signatureKey: upload.key,
      photoKeys: [],
      location: null,
      ...overrides,
    }),
  );
}

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
  await prisma.companyCounter.create({ data: { companyId: a.companyId, key: COUNTER_KEYS.route, value: 1 } });
  expedicao = { ...(await a.db.user.create({ data: { companyId: a.companyId, name: "Expedição A", email: "expedicao-acerto@teste.local", passwordHash: "x", role: "EXPEDICAO" } })), role: "EXPEDICAO" };
  orders.dinheiro = await newOrder("DINHEIRO", "24");
  orders.pix = await newOrder("PIX", "12");
  orders.faturado = await newOrder("FATURADO", "12");
  orders.naoEntregue = await newOrder("DINHEIRO", "6");
  const created = await createRoute(contextOf(a.admin), createRouteSchema.parse({ deliveryDate: today, name: "Acerto", driverId: a.driver.id, vehicleId: null, orderIds: Object.values(orders) }));
  routeId = created.id;
  await releaseRoute(contextOf(a.admin), created);
});

describe("fechamento antes e durante a rota", () => {
  it("rota liberada ainda não tem fechamento; motorista e outra empresa não acessam", async () => {
    expect((await rejection(getSettlement(contextOf(a.admin), routeId))).message).toBe(SETTLEMENT_MESSAGES.notOpen);
    await startDriverRoute(contextOf(a.driver), routeId);
    expect((await rejection(getSettlement(contextOf(a.driver), routeId))).code).toBe("SEM_PERMISSAO");
    expect((await rejection(getSettlement(contextOf(b.admin), routeId))).code).toBe("NAO_ENCONTRADO");
    const open = await getSettlement(contextOf(expedicao), routeId);
    expect(open.settlement.openStops).toBe(4);
  });

  it("concluir com paradas abertas é recusado", async () => {
    const { route } = await getSettlement(contextOf(a.admin), routeId);
    expect((await rejection(concludeSettlement(contextOf(a.admin), { id: routeId, version: route.version, cashHandedInCents: 0 }))).message).toBe(SETTLEMENT_MESSAGES.notAwaiting);
  });
});

describe("números do acerto", () => {
  it("esperado, dinheiro, Pix a conferir, mercadoria e vasilhames", async () => {
    await deliver(orders.dinheiro, { cashCents: 24 * 549, containers: [{ containerProductId: a.container.id, delivered: 2, returned: 1 }] });
    await deliver(orders.pix, { pixCents: 12 * 549 });
    await deliver(orders.faturado, {});
    await finalizeDelivery(
      contextOf(a.driver),
      finalizeDeliverySchema.parse({ clientRequestId: randomUUID(), orderId: orders.naoEntregue, outcome: "NAO_ENTREGUE", deliveredAt: new Date().toISOString(), items: [], failureReason: "ESTABELECIMENTO_FECHADO", failureNote: null, cashCents: 0, pixCents: 0, confirmDifferentAmount: false, containers: [], receiverName: null, receiverDocument: null, signatureKey: null, photoKeys: [], location: null }),
    );

    const { route, settlement, stops } = await getSettlement(contextOf(expedicao), routeId);
    expect(route.status).toBe("AGUARDANDO_ACERTO");
    expect(settlement.money).toEqual({
      expectedCents: 36 * 549,
      cashCents: 24 * 549,
      pixInformedCents: 12 * 549,
      pixConfirmedCents: 0,
      pixPendingCents: 12 * 549,
      receivedCents: 24 * 549,
      cashHandedInCents: null,
      differenceCents: null,
    });
    // 24 + 12 + 12 entregues; 6 não entregues.
    expect(settlement.goods).toEqual([expect.objectContaining({ sku: "LEITE-1L", loadedMilli: 54_000, deliveredMilli: 48_000, returnedMilli: 6_000, openMilli: 0 })]);
    // Caixas que saíram: 2 + 1 + 1 + 1 = 5; deixadas 2, recolhida 1.
    expect(settlement.containers).toEqual([{ productId: a.container.id, sku: "CAIXA", name: "Caixa retornável", out: 5, left: 2, collected: 1, backToDepot: 4, withCustomers: 1 }]);
    expect(settlement.pix).toEqual([expect.objectContaining({ orderId: orders.pix, amountCents: 12 * 549, confirmed: false })]);
    // Documento do recebedor nunca sai inteiro.
    expect(stops[0]?.proof?.receiverDocument).toBe("••••••••09");
    expect(maskDocument("12")).toBe("••");
  });

  it("Pix: confirmar conta como recebido; desmarcar volta; tudo auditado", async () => {
    await setPixConfirmation(contextOf(expedicao), { orderId: orders.pix, confirmed: true });
    expect((await getSettlement(contextOf(a.admin), routeId)).settlement.money).toMatchObject({ pixConfirmedCents: 12 * 549, pixPendingCents: 0, receivedCents: 36 * 549 });
    await setPixConfirmation(contextOf(expedicao), { orderId: orders.pix, confirmed: false });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orders.pix } })).toMatchObject({ paymentStatus: "PIX_A_CONFERIR" });
    expect((await prisma.auditLog.findMany({ where: { entityId: orders.pix, action: { startsWith: "PIX_" } }, orderBy: { createdAt: "asc" } })).map((log) => log.action)).toEqual(["PIX_CONFIRMADO", "PIX_DESCONFIRMADO"]);
    expect((await rejection(setPixConfirmation(contextOf(expedicao), { orderId: orders.dinheiro, confirmed: true }))).message).toBe(SETTLEMENT_MESSAGES.noPix);
    expect((await rejection(setPixConfirmation(contextOf(b.admin), { orderId: orders.pix, confirmed: true }))).code).toBe("NAO_ENCONTRADO");
  });

  it("correção de valores: só ADMIN, com motivo; recalcula a situação do pagamento", async () => {
    const input = paymentCorrectionSchema.parse({ orderId: orders.dinheiro, cashCents: 13_000, pixCents: 176, reason: "Cliente pagou parte no Pix" });
    expect((await rejection(correctDeliveryPayment(contextOf(expedicao), input))).code).toBe("SEM_PERMISSAO");
    expect(paymentCorrectionSchema.safeParse({ ...input, reason: " " }).success).toBe(false);
    await correctDeliveryPayment(contextOf(a.admin), input);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orders.dinheiro } })).toMatchObject({ paymentStatus: "PIX_A_CONFERIR" });
    expect(await prisma.deliveryProof.findFirstOrThrow({ where: { orderId: orders.dinheiro } })).toMatchObject({ cashCollectedCents: 13_000, pixCollectedCents: 176 });
    expect(await prisma.auditLog.findFirstOrThrow({ where: { entityId: orders.dinheiro, action: "ENTREGA_CORRIGIDA" } })).toMatchObject({
      userId: a.admin.id,
      reason: "Cliente pagou parte no Pix",
      before: { cashCents: 24 * 549, pixCents: 0 },
      after: { cashCents: 13_000, pixCents: 176 },
    });
    expect((await rejection(correctDeliveryPayment(contextOf(a.admin), { ...input, orderId: orders.faturado }))).message).toBe(SETTLEMENT_MESSAGES.billed);
    expect((await rejection(correctDeliveryPayment(contextOf(a.admin), { ...input, orderId: orders.naoEntregue }))).message).toBe(SETTLEMENT_MESSAGES.notDelivered);
    // Volta ao valor original para o resto dos testes.
    await correctDeliveryPayment(contextOf(a.admin), { ...input, cashCents: 24 * 549, pixCents: 0, reason: "Desfaz a correção" });
  });

  it("comprovante: URLs de 5 minutos só depois de conferir empresa; arquivo apagado não gera URL", async () => {
    const files = await getProofFileUrls(contextOf(expedicao), orders.dinheiro);
    expect(files.signatureUrl).toMatch(/X-Amz-Expires=300/);
    expect(files.photoUrls).toEqual([]);
    expect((await fetch(files.signatureUrl ?? "")).status).toBe(200);
    expect((await rejection(getProofFileUrls(contextOf(b.admin), orders.dinheiro))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(getProofFileUrls(contextOf(a.driver), orders.dinheiro))).code).toBe("SEM_PERMISSAO");

    const proof = await prisma.deliveryProof.findFirstOrThrow({ where: { orderId: orders.faturado } });
    await prisma.fileObject.update({ where: { key: proof.signatureFileKey ?? "" }, data: { deletedAt: new Date() } });
    expect(await getProofFileUrls(contextOf(expedicao), orders.faturado)).toEqual({ signatureUrl: null, photoUrls: [], removedByRetention: 1 });
  });
});

describe("concluir acerto", () => {
  it("versão antiga é recusada; conclui com Pix a conferir; grava caixa e diferença na auditoria", async () => {
    const { route } = await getSettlement(contextOf(expedicao), routeId);
    expect((await rejection(concludeSettlement(contextOf(expedicao), { id: routeId, version: route.version - 1, cashHandedInCents: 0 }))).message).toBe(MESSAGES.staleVersion);
    expect((await rejection(concludeSettlement(contextOf(expedicao, "PAST_DUE"), { id: routeId, version: route.version, cashHandedInCents: 0 }))).code).toBe("SOMENTE_LEITURA");

    // Caixa: R$ 130,00 de R$ 131,76 esperados em dinheiro -> falta de R$ 1,76.
    await concludeSettlement(contextOf(expedicao), { id: routeId, version: route.version, cashHandedInCents: 13_000 });
    const concluded = await getSettlement(contextOf(expedicao), routeId);
    expect(concluded.route).toMatchObject({ status: "CONCLUIDA", closedByName: "Expedição A" });
    expect(concluded.settlement.money).toMatchObject({ cashHandedInCents: 13_000, differenceCents: -176, pixPendingCents: 12 * 549 });
    expect(await prisma.auditLog.findFirstOrThrow({ where: { entityId: routeId, action: "ACERTO_CONCLUIDO" } })).toMatchObject({
      userId: expedicao.id,
      after: { status: "CONCLUIDA", expectedCents: 36 * 549, cashHandedInCents: 13_000, differenceCents: -176, pixPendingCount: 1 },
    });
  });

  it("depois de concluído: Pix ainda pode ser confirmado; desmarcar e corrigir não", async () => {
    await setPixConfirmation(contextOf(expedicao), { orderId: orders.pix, confirmed: true });
    expect((await getSettlement(contextOf(expedicao), routeId)).settlement.money.pixPendingCents).toBe(0);
    expect((await rejection(setPixConfirmation(contextOf(expedicao), { orderId: orders.pix, confirmed: false }))).message).toBe(SETTLEMENT_MESSAGES.concluded);
    expect((await rejection(correctDeliveryPayment(contextOf(a.admin), { orderId: orders.dinheiro, cashCents: 1, pixCents: 0, reason: "Tarde demais" }))).message).toBe(SETTLEMENT_MESSAGES.concluded);
    const { route } = await getSettlement(contextOf(expedicao), routeId);
    expect((await rejection(concludeSettlement(contextOf(expedicao), { id: routeId, version: route.version, cashHandedInCents: 0 }))).message).toBe(SETTLEMENT_MESSAGES.concluded);
  });
});
