// Área do motorista no servidor (seção 5.7): lista do dia, iniciar rota, pacote, presign e
// finalização idempotente. Inclui os testes obrigatórios da seção 9: reenvio do mesmo
// clientRequestId, arquivo ausente ou de outra empresa, motorista de outra rota.

import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { todayInTimeZone } from "@/domain/dates";
import { COUNTER_KEYS } from "@/lib/counters";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { DELIVERY_MESSAGES, MissingFileError, finalizeDelivery, presignProofUploads } from "@/lib/services/deliveries";
import { DRIVER_MESSAGES, getDriverRouteBundle, listDriverRoutesForToday, startDriverRoute } from "@/lib/services/driver-routes";
import { createOrder } from "@/lib/services/orders";
import { createRoute, releaseRoute } from "@/lib/services/routes";
import { buildProofFileKey } from "@/lib/storage/keys";
import { type FinalizeDeliveryInput, finalizeDeliverySchema, presignSchema } from "@/lib/validation/deliveries";
import { createOrderSchema } from "@/lib/validation/orders";
import { createRouteSchema } from "@/lib/validation/routes";
import { sampleSignaturePng } from "@/prisma/seed-support/png";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

const today = todayInTimeZone("America/Sao_Paulo");
const png = sampleSignaturePng(3);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 200 }, (_, i) => i % 256), 0xff, 0xd9]);

let a: CompanyFixture;
let b: CompanyFixture;
let driver2: { id: string; companyId: string; role: "MOTORISTA" };
const orders: Record<string, string> = {};
const routes: Record<string, string> = {};

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

async function newOrder(f: CompanyFixture, paymentMethod: "DINHEIRO" | "PIX" | "FATURADO", quantity = "12") {
  const saved = await createOrder(
    contextOf(f.admin),
    createOrderSchema.parse({ customerId: f.customer.id, deliveryDate: today, paymentMethod, items: [{ productId: f.product.id, quantity }], confirmDuplicate: true }),
  );
  return saved.id;
}

async function releasedRoute(f: CompanyFixture, driverId: string, orderIds: string[], name: string) {
  const created = await createRoute(contextOf(f.admin), createRouteSchema.parse({ deliveryDate: today, name, driverId, vehicleId: null, orderIds }));
  await releaseRoute(contextOf(f.admin), created);
  return created.id;
}

async function put(upload: { url: string; headers: Record<string, string> }, body: Uint8Array) {
  const response = await fetch(upload.url, { method: "PUT", body: new Blob([new Uint8Array(body)]), headers: upload.headers });
  expect(response.ok).toBe(true);
}

async function itemsOf(orderId: string) {
  return prisma.orderItem.findMany({ where: { orderId } });
}

function delivery(orderId: string, overrides: Partial<FinalizeDeliveryInput> = {}) {
  return finalizeDeliverySchema.parse({
    clientRequestId: randomUUID(),
    orderId,
    outcome: "ENTREGUE",
    deliveredAt: new Date().toISOString(),
    items: [],
    failureReason: null,
    failureNote: null,
    cashCents: 12 * 549,
    pixCents: 0,
    confirmDifferentAmount: false,
    containers: [],
    receiverName: "Maria Recebedora",
    receiverDocument: null,
    signatureKey: null,
    photoKeys: [],
    location: null,
    ...overrides,
  });
}

/** Presign + upload real ao storage de teste, como o celular faz. */
async function uploadProof(ctx: ReturnType<typeof contextOf>, orderId: string, clientRequestId: string, files: Array<"SIGNATURE" | "PHOTO">) {
  const result = await presignProofUploads(
    ctx,
    presignSchema.parse({
      clientRequestId,
      orderId,
      files: files.map((kind) => (kind === "SIGNATURE" ? { kind, contentType: "image/png", sizeBytes: png.byteLength } : { kind, contentType: "image/jpeg", sizeBytes: jpeg.byteLength })),
    }),
  );
  if (result.status !== "ok") throw new Error("presign inesperado");
  for (const [index, upload] of result.uploads.entries()) await put(upload, files[index] === "SIGNATURE" ? png : jpeg);
  return result.uploads.map((upload) => upload.key);
}

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
  await prisma.companyCounter.createMany({ data: [a, b].map((f) => ({ companyId: f.companyId, key: COUNTER_KEYS.route, value: 1 })) });
  driver2 = { ...(await a.db.user.create({ data: { companyId: a.companyId, name: "Motorista Dois", email: "motorista-dois@teste.local", passwordHash: "x", role: "MOTORISTA" } })), role: "MOTORISTA" };

  orders.dinheiro = await newOrder(a, "DINHEIRO");
  orders.pix = await newOrder(a, "PIX");
  orders.faturado = await newOrder(a, "FATURADO");
  orders.ultimo = await newOrder(a, "DINHEIRO");
  orders.outra1 = await newOrder(a, "DINHEIRO");
  orders.outra2 = await newOrder(a, "DINHEIRO");
  orders.naoIniciada = await newOrder(a, "DINHEIRO");
  orders.rascunho = await newOrder(a, "DINHEIRO");
  orders.b = await newOrder(b, "DINHEIRO");

  routes.principal = await releasedRoute(a, a.driver.id, [orders.dinheiro, orders.pix, orders.faturado, orders.ultimo] as string[], "Principal");
  routes.dois = await releasedRoute(a, driver2.id, [orders.outra1, orders.outra2] as string[], "Do motorista dois");
  routes.naoIniciada = await releasedRoute(a, a.driver.id, [orders.naoIniciada] as string[], "Segunda do dia");
  routes.rascunho = (await createRoute(contextOf(a.admin), createRouteSchema.parse({ deliveryDate: today, name: "Rascunho", driverId: a.driver.id, vehicleId: null, orderIds: [orders.rascunho] }))).id;
  routes.b = await releasedRoute(b, b.driver.id, [orders.b] as string[], "Da B");
});

describe("lista do dia", () => {
  it("motorista vê só as próprias rotas liberadas; rascunho não aparece", async () => {
    const mine = await listDriverRoutesForToday(contextOf(a.driver));
    expect(mine.routes.map((route) => route.name)).toEqual(["Principal", "Segunda do dia"]);
    expect(mine.routes[0]).toMatchObject({ status: "LIBERADA_CARGA", stops: 4, done: 0, driverName: "Motorista A" });
    expect((await listDriverRoutesForToday(contextOf(driver2))).routes.map((route) => route.name)).toEqual(["Do motorista dois"]);
  });

  it("ADMIN vê todas as rotas do dia da empresa (decisão do dono do produto), nunca as da B", async () => {
    const all = await listDriverRoutesForToday(contextOf(a.admin));
    expect(all.routes.map((route) => route.name).sort()).toEqual(["Do motorista dois", "Principal", "Segunda do dia"]);
  });
});

describe("pacote e início da rota", () => {
  it("pacote tem paradas, itens com vasilhame, valores e política de comprovante", async () => {
    const bundle = await getDriverRouteBundle(contextOf(a.driver), routes.principal as string);
    expect(bundle.company).toEqual({ name: "Empresa A", proofPolicy: "PHOTO_OR_SIGNATURE" });
    expect(bundle.route).toMatchObject({ name: "Principal", status: "LIBERADA_CARGA", driverName: "Motorista A" });
    expect(bundle.stops).toHaveLength(4);
    expect(bundle.stops[0]).toMatchObject({
      stopSequence: 1,
      status: "EM_ROTA",
      customerName: "Cliente A",
      addressLine: "Rua Um, 10, Centro, Ribeirão Preto - SP, 14010-000",
      paymentMethod: "DINHEIRO",
      amountToCollectCents: 12 * 549,
      lines: [{ productName: "Leite 1L", unit: "UN", quantityMilli: 12_000, unitPriceCents: 549, container: { sku: "CAIXA", unitsPerContainer: 12 } }],
    });
    // A fixture tem 1 caixa entregue a este cliente numa rota antiga.
    expect(bundle.stops[0]?.containerBalance).toEqual([{ productId: a.container.id, sku: "CAIXA", name: "Caixa retornável", balance: 1 }]);
  });

  it("rota de outro motorista, de outra empresa ou inexistente: 404; rascunho já baixado: avisa", async () => {
    for (const [ctx, id] of [
      [contextOf(driver2), routes.principal],
      [contextOf(b.admin), routes.principal],
      [contextOf(a.driver), "inexistente"],
    ] as const) {
      expect((await rejection(getDriverRouteBundle(ctx, id as string))).code).toBe("NAO_ENCONTRADO");
      expect((await rejection(startDriverRoute(ctx, id as string))).code).toBe("NAO_ENCONTRADO");
    }
    expect((await rejection(startDriverRoute(contextOf(a.driver), routes.rascunho as string))).message).toBe(DRIVER_MESSAGES.draft);
  });

  it("EXPEDICAO não usa a área do motorista", async () => {
    const expedicao = { id: a.admin.id, companyId: a.companyId, role: "EXPEDICAO" as const };
    expect((await rejection(listDriverRoutesForToday(contextOf(expedicao)))).code).toBe("SEM_PERMISSAO");
  });

  it("finalizar antes de iniciar é recusado", async () => {
    expect((await rejection(finalizeDelivery(contextOf(a.driver), delivery(orders.naoIniciada as string)))).message).toBe(DRIVER_MESSAGES.notStarted);
  });

  it("iniciar: vai para EM_ANDAMENTO; tocar de novo só baixa o pacote; segunda rota do motorista espera", async () => {
    const bundle = await startDriverRoute(contextOf(a.driver), routes.principal as string);
    expect(bundle.route.status).toBe("EM_ANDAMENTO");
    expect((await prisma.route.findUniqueOrThrow({ where: { id: routes.principal } })).startedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: routes.principal, action: "ROTA_INICIADA" } })).toBe(1);

    expect((await startDriverRoute(contextOf(a.driver), routes.principal as string)).route.status).toBe("EM_ANDAMENTO");
    expect(await prisma.auditLog.count({ where: { entityId: routes.principal, action: "ROTA_INICIADA" } })).toBe(1);

    expect((await rejection(startDriverRoute(contextOf(a.driver), routes.naoIniciada as string))).message).toBe(DRIVER_MESSAGES.otherInProgress("R-0002"));
  });

  it("plano em atraso não impede iniciar rota liberada (decisão do dono do produto)", async () => {
    const bundle = await startDriverRoute(contextOf(driver2, "PAST_DUE"), routes.dois as string);
    expect(bundle.route.status).toBe("EM_ANDAMENTO");
  });
});

describe("presign", () => {
  it("cria arquivos PENDING no prefixo do pedido; recusa parada de outro motorista", async () => {
    const result = await presignProofUploads(contextOf(a.driver), presignSchema.parse({ clientRequestId: randomUUID(), orderId: orders.dinheiro, files: [{ kind: "PHOTO", contentType: "image/jpeg", sizeBytes: 1000 }] }));
    expect(result.status).toBe("ok");
    const key = result.status === "ok" ? (result.uploads[0]?.key ?? "") : "";
    expect(key).toMatch(new RegExp(`^companies/${a.companyId}/proofs/${orders.dinheiro}/[0-9a-f-]{36}\\.jpg$`));
    expect(await prisma.fileObject.findUniqueOrThrow({ where: { key } })).toMatchObject({ status: "PENDING", kind: "PHOTO", mimeType: "image/jpeg", sizeBytes: 1000, uploadedById: a.driver.id });

    expect((await rejection(presignProofUploads(contextOf(driver2), presignSchema.parse({ clientRequestId: randomUUID(), orderId: orders.dinheiro, files: [{ kind: "PHOTO", contentType: "image/jpeg", sizeBytes: 10 }] })))).code).toBe("NAO_ENCONTRADO");
  });

  it("tipo, tamanho e quantidade validados", () => {
    const base = { clientRequestId: randomUUID(), orderId: "x" };
    expect(presignSchema.safeParse({ ...base, files: [{ kind: "PHOTO", contentType: "image/gif", sizeBytes: 10 }] }).success).toBe(false);
    expect(presignSchema.safeParse({ ...base, files: [{ kind: "PHOTO", contentType: "image/jpeg", sizeBytes: 2 * 1024 * 1024 + 1 }] }).success).toBe(false);
    expect(presignSchema.safeParse({ ...base, files: Array(4).fill({ kind: "PHOTO", contentType: "image/jpeg", sizeBytes: 10 }) }).success).toBe(false);
    expect(presignSchema.safeParse({ ...base, files: Array(2).fill({ kind: "SIGNATURE", contentType: "image/png", sizeBytes: 10 }) }).success).toBe(false);
  });
});

describe("finalizar entrega", () => {
  it("entregue com assinatura e foto: comprovante, arquivos confirmados, pedido, pagamento e vasilhames em uma transação", async () => {
    const clientRequestId = randomUUID();
    const [signatureKey, photoKey] = await uploadProof(contextOf(a.driver), orders.dinheiro as string, clientRequestId, ["SIGNATURE", "PHOTO"]);
    const result = await finalizeDelivery(
      contextOf(a.driver),
      delivery(orders.dinheiro as string, {
        clientRequestId,
        signatureKey: signatureKey ?? null,
        photoKeys: [photoKey as string],
        containers: [{ containerProductId: a.container.id, delivered: 1, returned: 1 }],
        location: { latitude: -21.17, longitude: -47.81, accuracyMeters: 12 },
      }),
    );
    expect(result).toEqual({ orderId: orders.dinheiro, outcome: "ENTREGUE", routeStatus: "EM_ANDAMENTO", alreadyProcessed: false });

    const proof = await prisma.deliveryProof.findUniqueOrThrow({ where: { companyId_orderId: { companyId: a.companyId, orderId: orders.dinheiro as string } } });
    expect(proof).toMatchObject({ outcome: "ENTREGUE", receiverName: "Maria Recebedora", signatureFileKey: signatureKey, photoFileKeys: [photoKey], cashCollectedCents: 12 * 549, latitude: -21.17, recordedById: a.driver.id });
    expect((await prisma.fileObject.findMany({ where: { key: { in: [signatureKey as string, photoKey as string] } } })).map((file) => file.status)).toEqual(["CONFIRMED", "CONFIRMED"]);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orders.dinheiro } })).toMatchObject({ status: "ENTREGUE", paymentStatus: "RECEBIDO", amountToCollectCents: 12 * 549, version: 4 });
    expect((await itemsOf(orders.dinheiro as string))[0]?.deliveredQuantity?.toString()).toBe("12");
    expect(await prisma.containerMovement.findMany({ where: { orderId: orders.dinheiro }, select: { delivered: true, returned: true, routeId: true } })).toEqual([{ delivered: 1, returned: 1, routeId: routes.principal }]);
    expect(await prisma.auditLog.count({ where: { entityId: orders.dinheiro, action: "ENTREGA_FINALIZADA" } })).toBe(1);

    // Reenvio com o mesmo clientRequestId (o sinal caiu antes da resposta): mesmo resultado, nada novo.
    const again = await finalizeDelivery(contextOf(a.driver), delivery(orders.dinheiro as string, { clientRequestId, signatureKey: signatureKey ?? null, photoKeys: [photoKey as string] }));
    expect(again).toEqual({ ...result, alreadyProcessed: true });
    expect(await prisma.deliveryProof.count({ where: { orderId: orders.dinheiro } })).toBe(1);
    expect(await prisma.containerMovement.count({ where: { orderId: orders.dinheiro } })).toBe(1);
    expect(await presignProofUploads(contextOf(a.driver), presignSchema.parse({ clientRequestId, orderId: orders.dinheiro, files: [{ kind: "PHOTO", contentType: "image/jpeg", sizeBytes: 10 }] }))).toEqual({
      status: "ja-processado",
      result: again,
    });

    // Outro envio (outro clientRequestId) para a mesma parada: recusado.
    expect((await rejection(finalizeDelivery(contextOf(a.driver), delivery(orders.dinheiro as string)))).message).toBe(DELIVERY_MESSAGES.otherProof);
  });

  it("arquivo que não chegou ao storage, de outra empresa ou de outro pedido é recusado", async () => {
    const presigned = await presignProofUploads(contextOf(a.driver), presignSchema.parse({ clientRequestId: randomUUID(), orderId: orders.pix, files: [{ kind: "SIGNATURE", contentType: "image/png", sizeBytes: png.byteLength }] }));
    const missingKey = presigned.status === "ok" ? (presigned.uploads[0]?.key ?? "") : "";
    const missing = await finalizeDelivery(contextOf(a.driver), delivery(orders.pix as string, { cashCents: 0, pixCents: 12 * 549, signatureKey: missingKey })).catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(MissingFileError);

    const otherCompanyKey = buildProofFileKey({ companyId: b.companyId, orderId: orders.pix as string, contentType: "image/png" });
    const otherOrderKey = buildProofFileKey({ companyId: a.companyId, orderId: orders.faturado as string, contentType: "image/png" });
    for (const key of [otherCompanyKey, otherOrderKey, "companies/../segredo.png"]) {
      expect((await rejection(finalizeDelivery(contextOf(a.driver), delivery(orders.pix as string, { cashCents: 0, pixCents: 12 * 549, signatureKey: key })))).message).toBe(DELIVERY_MESSAGES.badFile);
    }
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orders.pix } })).toMatchObject({ status: "EM_ROTA" });
  });

  it("regras do comprovante valem no servidor", async () => {
    const error = await rejection(finalizeDelivery(contextOf(a.driver), delivery(orders.pix as string, { cashCents: 0, pixCents: 12 * 549 })));
    expect(error).toMatchObject({ code: "VALIDACAO", message: "Colete a assinatura ou tire uma foto." });
    const [signatureKey] = await uploadProof(contextOf(a.driver), orders.pix as string, randomUUID(), ["SIGNATURE"]);
    expect((await rejection(finalizeDelivery(contextOf(a.driver), delivery(orders.pix as string, { receiverName: null, signatureKey: signatureKey ?? null })))).message).toBe("Informe o nome de quem recebeu.");
  });

  it("parcial: valor a cobrar recalculado substitui o do pedido; Pix fica a conferir; motivo por item", async () => {
    const clientRequestId = randomUUID();
    const [signatureKey] = await uploadProof(contextOf(a.driver), orders.pix as string, clientRequestId, ["SIGNATURE"]);
    const [item] = await itemsOf(orders.pix as string);
    await finalizeDelivery(
      contextOf(a.driver),
      delivery(orders.pix as string, {
        clientRequestId,
        outcome: "ENTREGUE_PARCIAL",
        items: [{ orderItemId: item?.id as string, deliveredMilli: 6_000, returnReason: "Cliente recusou metade" }],
        cashCents: 0,
        pixCents: 6 * 549,
        signatureKey: signatureKey ?? null,
      }),
    );
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orders.pix } })).toMatchObject({ status: "ENTREGUE_PARCIAL", paymentStatus: "PIX_A_CONFERIR", amountToCollectCents: 6 * 549, totalCents: 12 * 549 });
    expect(await itemsOf(orders.pix as string)).toEqual([expect.objectContaining({ returnReason: "Cliente recusou metade" })]);
    expect((await itemsOf(orders.pix as string))[0]?.deliveredQuantity?.toString()).toBe("6");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: orders.pix, action: "ENTREGA_FINALIZADA" } });
    expect(audit).toMatchObject({ before: { amountToCollectCents: 12 * 549 }, after: { amountToCollectCents: 6 * 549 } });
  });

  it("não entregue: motivo, nada recebido, quantidade entregue zero", async () => {
    await finalizeDelivery(
      contextOf(a.driver),
      delivery(orders.faturado as string, { outcome: "NAO_ENTREGUE", failureReason: "ESTABELECIMENTO_FECHADO", failureNote: "Portão trancado", cashCents: 0, receiverName: null }),
    );
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orders.faturado } })).toMatchObject({ status: "NAO_ENTREGUE", paymentStatus: "FATURADO", amountToCollectCents: 0 });
    expect(await prisma.deliveryProof.findFirstOrThrow({ where: { orderId: orders.faturado } })).toMatchObject({ failureReason: "ESTABELECIMENTO_FECHADO", failureNote: "Portão trancado", receiverName: null });
    expect((await itemsOf(orders.faturado as string))[0]?.deliveredQuantity?.toString()).toBe("0");
  });

  it("motorista não finaliza parada de rota de outro motorista; ADMIN finaliza; última parada leva a rota ao acerto", async () => {
    expect((await rejection(finalizeDelivery(contextOf(driver2), delivery(orders.ultimo as string)))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(finalizeDelivery(contextOf(b.admin), delivery(orders.ultimo as string)))).code).toBe("NAO_ENCONTRADO");

    const [signatureKey] = await uploadProof(contextOf(a.admin), orders.ultimo as string, randomUUID(), ["SIGNATURE"]);
    const result = await finalizeDelivery(contextOf(a.admin, "PAST_DUE"), delivery(orders.ultimo as string, { signatureKey: signatureKey ?? null, cashCents: 5_000, confirmDifferentAmount: true }));
    expect(result.routeStatus).toBe("AGUARDANDO_ACERTO");
    const route = await prisma.route.findUniqueOrThrow({ where: { id: routes.principal } });
    expect(route.status).toBe("AGUARDANDO_ACERTO");
    expect(route.finishedAt).not.toBeNull();
    expect((await listDriverRoutesForToday(contextOf(a.driver))).routes.find((item) => item.id === routes.principal)).toMatchObject({ done: 4, status: "AGUARDANDO_ACERTO" });
  });

  it("dois envios iguais ao mesmo tempo gravam um comprovante só", async () => {
    const clientRequestId = randomUUID();
    const [signatureKey] = await uploadProof(contextOf(driver2), orders.outra1 as string, clientRequestId, ["SIGNATURE"]);
    const input = delivery(orders.outra1 as string, { clientRequestId, signatureKey: signatureKey ?? null });
    const results = await Promise.all([finalizeDelivery(contextOf(driver2), input), finalizeDelivery(contextOf(driver2), input)]);
    expect(results.map((result) => result.alreadyProcessed).sort()).toEqual([false, true]);
    expect(await prisma.deliveryProof.count({ where: { clientRequestId } })).toBe(1);
  });
});
