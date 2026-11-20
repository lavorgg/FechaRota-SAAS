// Rotas e romaneios (seção 5.6): agrupador, criação, ordem, liberação, reabertura, exclusão de
// rascunho, romaneios e isolamento entre empresas.

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, formatInstant, todayInTimeZone } from "@/domain/dates";
import { normalizeKey } from "@/domain/normalize";
import { customerSearchText } from "@/domain/search";
import { COUNTER_KEYS } from "@/lib/counters";
import { prisma } from "@/lib/db";
import { MESSAGES, ServiceError } from "@/lib/errors";
import { getCompanySettings, updateCompanySettings } from "@/lib/services/company";
import { MANIFEST_MESSAGES, getCargoManifest, getDeliveryManifest } from "@/lib/services/manifests";
import { cancelOrder, createOrder } from "@/lib/services/orders";
import {
  ROUTE_MESSAGES,
  addOrdersToRoute,
  createRoute,
  deleteDraftRoute,
  getRouteDetail,
  getRoutePlanning,
  releaseRoute,
  removeOrderFromRoute,
  reopenRoute,
  reorderRouteStops,
  updateRoute,
} from "@/lib/services/routes";
import { createOrderSchema } from "@/lib/validation/orders";
import { companySettingsSchema, createRouteSchema, reopenRouteSchema } from "@/lib/validation/routes";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

/** Campos de operação da empresa, obrigatórios no formulário. */
const OPERACAO = { timezone: "America/Sao_Paulo", proofPolicy: "PHOTO_OR_SIGNATURE", fileRetentionMonths: "12" } as const;

let a: CompanyFixture;
let b: CompanyFixture;
let expedicao: { id: string; companyId: string; role: "EXPEDICAO" };
const today = todayInTimeZone("America/Sao_Paulo");
const tomorrow = addDays(today, 1);

type Ids = { c1: string; c2: string; c3: string; c4: string; o1: string; o2: string; o3: string; o4: string; o5: string; o6: string; bOrder: string };
const ids = {} as Ids;

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

async function customer(f: CompanyFixture, name: string, street: string, number: string, neighborhood: string, city = "Ribeirão Preto") {
  const row = await f.db.customer.create({
    data: {
      companyId: f.companyId,
      name,
      phone: "5516999990000",
      deliveryWindow: "8h às 11h",
      zipCode: "14010000",
      street,
      number,
      neighborhood,
      city,
      state: "SP",
      neighborhoodKey: normalizeKey(neighborhood),
      cityKey: normalizeKey(city),
      searchText: customerSearchText({ name, neighborhood, city }),
      defaultPaymentMethod: "DINHEIRO",
    },
  });
  return row.id;
}

async function order(f: CompanyFixture, customerId: string, overrides: Record<string, unknown> = {}) {
  const saved = await createOrder(
    contextOf(f.admin),
    createOrderSchema.parse({ customerId, deliveryDate: tomorrow, paymentMethod: "DINHEIRO", items: [{ productId: f.product.id, quantity: "12" }], confirmDuplicate: true, ...overrides }),
  );
  return saved.id;
}

function routeInput(orderIds: string[], overrides: Record<string, unknown> = {}) {
  return createRouteSchema.parse({ deliveryDate: tomorrow, name: "Zona Sul", driverId: a.driver.id, vehicleId: a.vehicle.id, orderIds, ...overrides });
}

async function versionOf(routeId: string) {
  return (await prisma.route.findUniqueOrThrow({ where: { id: routeId } })).version;
}

async function stopsOf(routeId: string) {
  const orders = await prisma.order.findMany({ where: { routeId }, orderBy: { stopSequence: "asc" }, select: { id: true, stopSequence: true } });
  return orders.map((o) => [o.id, o.stopSequence]);
}

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
  // A fixture já tem a rota R-0001.
  await prisma.companyCounter.createMany({ data: [a, b].map((f) => ({ companyId: f.companyId, key: COUNTER_KEYS.route, value: 1 })) });
  expedicao = { ...(await a.db.user.create({ data: { companyId: a.companyId, name: "Expedição A", email: "expedicao-rotas@teste.local", passwordHash: "x", role: "EXPEDICAO" } })), role: "EXPEDICAO" };

  ids.c1 = await customer(a, "Mercado Bela Vista", "Rua das Flores", "200", "Jardim Paulista");
  ids.c2 = await customer(a, "Padaria Sol", "Rua das Flores", "15", "jardim paulista ");
  ids.c3 = await customer(a, "Bar do Zé", "Avenida Brasil", "1000", "Centro");
  ids.c4 = await customer(a, "Empório Sertão", "Rua Amazonas", "5", "Centro", "Sertãozinho");
  ids.o1 = await order(a, ids.c1, { invoiceNumber: "4321", notes: "Entregar pelos fundos" });
  ids.o2 = await order(a, ids.c2, { paymentMethod: "FATURADO" });
  ids.o3 = await order(a, ids.c3, { items: [{ productId: a.product.id, quantity: "30" }] });
  ids.o4 = await order(a, ids.c4);
  ids.o5 = await order(a, ids.c1, { deliveryDate: addDays(today, 2) });
  ids.o6 = await order(a, ids.c3);
  const o6 = await prisma.order.findUniqueOrThrow({ where: { id: ids.o6 } });
  await cancelOrder(contextOf(a.admin), { id: ids.o6, version: o6.version, reason: "Cliente desistiu" });
  ids.bOrder = await order(b, b.customer.id);
});

describe("agrupador", () => {
  it("mostra só pedidos PENDENTE sem rota da data, por cidade e bairro (chave normalizada)", async () => {
    const planning = await getRoutePlanning(contextOf(a.admin), tomorrow);
    expect(planning.groups.map((city) => city.city)).toEqual(["Ribeirão Preto", "Sertãozinho"]);
    const ribeirao = planning.groups[0];
    expect(ribeirao?.neighborhoods.map((n) => [n.neighborhood, n.orders.map((o) => o.id)])).toEqual([
      ["Centro", [ids.o3]],
      ["Jardim Paulista", [ids.o2, ids.o1]],
    ]);
    // 12 × 1,050 kg = 12,6 kg; 30 × 1,050 kg = 31,5 kg. Volumes = itens dos pedidos.
    expect(ribeirao).toMatchObject({ orderCount: 3, weightGrams: 12_600 * 2 + 31_500, weightIncomplete: false, volumes: 3, totalCents: 549 * 54 });
    expect(planning.drivers).toEqual([{ id: a.driver.id, name: "Motorista A" }]);
    expect(planning.vehicles.map((v) => v.plate)).toEqual(["ABC1D23"]);
  });

  it("outra empresa não vê os pedidos nem as rotas da A", async () => {
    const planning = await getRoutePlanning(contextOf(b.admin), tomorrow);
    expect(planning.groups.flatMap((c) => c.neighborhoods.flatMap((n) => n.orders.map((o) => o.id)))).toEqual([ids.bOrder]);
    expect(planning.drivers.map((d) => d.id)).toEqual([b.driver.id]);
  });

  it("MOTORISTA não monta rota", async () => {
    expect((await rejection(getRoutePlanning(contextOf(a.driver), tomorrow))).code).toBe("SEM_PERMISSAO");
  });
});

let routeId = "";

describe("criar rota", () => {
  it("recusa motorista que não é MOTORISTA ativo da empresa, sem revelar outra empresa", async () => {
    for (const driverId of [a.admin.id, b.driver.id, "inexistente"]) {
      const error = await rejection(createRoute(contextOf(a.admin), routeInput([ids.o1], { driverId })));
      expect(error).toMatchObject({ code: "VALIDACAO", fieldErrors: { driverId: ROUTE_MESSAGES.driver } });
    }
    const error = await rejection(createRoute(contextOf(a.admin), routeInput([ids.o1], { vehicleId: b.vehicle.id })));
    expect(error).toMatchObject({ code: "VALIDACAO", fieldErrors: { vehicleId: ROUTE_MESSAGES.vehicle } });
  });

  it("recusa pedido de outra empresa, de outra data, cancelado ou já em rota, e não consome número", async () => {
    for (const orderId of [ids.bOrder, ids.o5, ids.o6, a.order.id]) {
      const error = await rejection(createRoute(contextOf(a.admin), routeInput([ids.o1, orderId])));
      expect(error).toMatchObject({ code: "CONFLITO", message: ROUTE_MESSAGES.ordersChanged });
    }
    expect(await prisma.order.count({ where: { id: ids.o1, routeId: { not: null } } })).toBe(0);
  });

  it("MOTORISTA não cria; plano em atraso é só leitura", async () => {
    expect((await rejection(createRoute(contextOf(a.driver), routeInput([ids.o1])))).code).toBe("SEM_PERMISSAO");
    expect((await rejection(createRoute(contextOf(a.admin, "PAST_DUE"), routeInput([ids.o1])))).code).toBe("SOMENTE_LEITURA");
  });

  it("EXPEDICAO cria: código sequencial, paradas na ordem sugerida, pedidos continuam PENDENTE", async () => {
    const saved = await createRoute(contextOf(expedicao), routeInput([ids.o1, ids.o2, ids.o3]));
    routeId = saved.id;
    expect(saved).toMatchObject({ code: "R-0002", version: 1 });
    // Centro antes de Jardim Paulista; na mesma rua, número 15 antes do 200.
    expect(await stopsOf(routeId)).toEqual([
      [ids.o3, 1],
      [ids.o2, 2],
      [ids.o1, 3],
    ]);
    const orders = await prisma.order.findMany({ where: { routeId } });
    expect(orders.every((o) => o.status === "PENDENTE" && o.version === 2)).toBe(true);
    const planning = await getRoutePlanning(contextOf(a.admin), tomorrow);
    expect(planning.groups.flatMap((c) => c.neighborhoods.flatMap((n) => n.orders.map((o) => o.id)))).toEqual([ids.o4]);
    expect(planning.routes).toEqual([
      expect.objectContaining({ id: routeId, code: "R-0002", status: "RASCUNHO", driverName: "Motorista A", vehiclePlate: "ABC1D23", orderCount: 3, volumes: 3 }),
    ]);
  });
});

describe("rascunho", () => {
  it("reordena paradas; a versão do pedido não muda", async () => {
    const version = await versionOf(routeId);
    const error = await rejection(reorderRouteStops(contextOf(a.admin), { id: routeId, version, orderIds: [ids.o1, ids.o2] }));
    expect(error).toMatchObject({ code: "CONFLITO", message: ROUTE_MESSAGES.stopsChanged });

    const saved = await reorderRouteStops(contextOf(a.admin), { id: routeId, version, orderIds: [ids.o1, ids.o2, ids.o3] });
    expect(saved.version).toBe(version + 1);
    expect(await stopsOf(routeId)).toEqual([
      [ids.o1, 1],
      [ids.o2, 2],
      [ids.o3, 3],
    ]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.o1 } })).version).toBe(2);
  });

  it("conflito de versão: duas edições simultâneas, só uma grava", async () => {
    const version = await versionOf(routeId);
    const results = await Promise.allSettled([
      updateRoute(contextOf(a.admin), { id: routeId, version, name: "Zona Sul 1", driverId: a.driver.id, vehicleId: null }),
      reorderRouteStops(contextOf(expedicao), { id: routeId, version, orderIds: [ids.o3, ids.o2, ids.o1] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toMatchObject({ code: "CONFLITO", message: MESSAGES.staleVersion });
    expect(await versionOf(routeId)).toBe(version + 1);

    // Versão antiga, mesmo sem corrida: recusada.
    const stale = await rejection(updateRoute(contextOf(a.admin), { id: routeId, version, name: "X", driverId: a.driver.id, vehicleId: null }));
    expect(stale.message).toBe(MESSAGES.staleVersion);
  });

  it("adiciona pedido no fim e remove pedido, renumerando as paradas", async () => {
    let version = await versionOf(routeId);
    const stopsBefore = (await stopsOf(routeId)).map(([id]) => id);
    version = (await addOrdersToRoute(contextOf(a.admin), { id: routeId, version, orderIds: [ids.o4] })).version;
    expect((await stopsOf(routeId)).map(([id]) => id)).toEqual([...stopsBefore, ids.o4]);

    const removedId = stopsBefore[1] as string;
    version = (await removeOrderFromRoute(contextOf(a.admin), { id: routeId, version, orderId: removedId })).version;
    const after = await stopsOf(routeId);
    expect(after.map(([, seq]) => seq)).toEqual([1, 2, 3]);
    expect(after.map(([id]) => id)).not.toContain(removedId);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: removedId } })).toMatchObject({ routeId: null, stopSequence: null, status: "PENDENTE", version: 3 });

    // Pedido de outra empresa ou fora da rota: mesma resposta.
    for (const orderId of [b.order.id, removedId]) {
      expect((await rejection(removeOrderFromRoute(contextOf(a.admin), { id: routeId, version, orderId }))).message).toBe(ROUTE_MESSAGES.orderNotInRoute);
    }
    // Devolve o pedido para a rota, para o resto dos testes.
    await addOrdersToRoute(contextOf(a.admin), { id: routeId, version: await versionOf(routeId), orderIds: [removedId] });
  });

  it("detalhe: links do Maps partem do depósito quando ele está cadastrado", async () => {
    await prisma.customer.update({ where: { id: ids.c1 }, data: { latitude: -21.1767, longitude: -47.8208 } });
    let detail = await getRouteDetail(contextOf(a.admin), routeId);
    expect(detail.hasDepot).toBe(false);
    expect(detail.mapsSegments).toHaveLength(1);
    expect(detail.mapsSegments[0]?.url).not.toContain("origin=");
    expect(detail.mapsSegments[0]?.url).toContain(encodeURIComponent("-21.1767,-47.8208"));
    expect(detail.stops).toHaveLength(4);
    expect(detail.available).toEqual([]);

    await updateCompanySettings(
      contextOf(a.admin),
      companySettingsSchema.parse({ ...OPERACAO, name: "Empresa A", depotZipCode: "14020-000", depotStreet: "Rua do Depósito", depotNumber: "1", depotNeighborhood: "Distrito Industrial", depotCity: "Ribeirão Preto", depotState: "SP" }),
    );
    detail = await getRouteDetail(contextOf(a.admin), routeId);
    expect(detail.hasDepot).toBe(true);
    expect(new URL(detail.mapsSegments[0]?.url ?? "").searchParams.get("origin")).toBe("Rua do Depósito, 1, Distrito Industrial, Ribeirão Preto - SP, 14020-000");
  });

  it("outra empresa recebe 404 para a rota da A", async () => {
    expect((await rejection(getRouteDetail(contextOf(b.admin), routeId))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(reorderRouteStops(contextOf(b.admin), { id: routeId, version: 1, orderIds: [ids.o1] }))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(releaseRoute(contextOf(b.admin), { id: routeId, version: await versionOf(routeId) }))).code).toBe("NAO_ENCONTRADO");
  });

  it("romaneio não sai em rascunho", async () => {
    expect((await rejection(getCargoManifest(contextOf(a.admin), routeId))).message).toBe(MANIFEST_MESSAGES.notPrintable);
    expect((await rejection(getDeliveryManifest(contextOf(a.admin), routeId))).message).toBe(MANIFEST_MESSAGES.notPrintable);
  });
});

describe("liberação e reabertura", () => {
  it("não libera rota vazia nem com motorista inativo", async () => {
    const other = await order(a, ids.c4);
    const empty = await createRoute(contextOf(a.admin), routeInput([other], { name: "Vazia" }));
    const removed = await removeOrderFromRoute(contextOf(a.admin), { id: empty.id, version: empty.version, orderId: other });
    expect((await rejection(releaseRoute(contextOf(a.admin), removed))).message).toBe(ROUTE_MESSAGES.empty);
    expect((await prisma.route.findUniqueOrThrow({ where: { id: empty.id } })).status).toBe("RASCUNHO");

    const added = await addOrdersToRoute(contextOf(a.admin), { ...removed, orderIds: [other] });
    await prisma.user.update({ where: { id: a.driver.id }, data: { active: false } });
    try {
      expect((await rejection(releaseRoute(contextOf(a.admin), added))).message).toBe(ROUTE_MESSAGES.inactiveDriver);
    } finally {
      await prisma.user.update({ where: { id: a.driver.id }, data: { active: true } });
    }
    await deleteDraftRoute(contextOf(a.admin), added);
  });

  it("liberar: pedidos vão para EM_ROTA, composição congela, auditoria registrada", async () => {
    const version = await versionOf(routeId);
    const saved = await releaseRoute(contextOf(expedicao), { id: routeId, version });
    expect(saved.version).toBe(version + 1);
    const route = await prisma.route.findUniqueOrThrow({ where: { id: routeId }, include: { orders: true } });
    expect(route.status).toBe("LIBERADA_CARGA");
    expect(route.orders.map((o) => o.status)).toEqual(["EM_ROTA", "EM_ROTA", "EM_ROTA", "EM_ROTA"]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: routeId, action: "ROTA_LIBERADA" } });
    expect(audit).toMatchObject({ userId: expedicao.id, before: { status: "RASCUNHO" }, after: { status: "LIBERADA_CARGA", version: version + 1 } });

    const ref = { id: routeId, version: saved.version };
    for (const attempt of [
      addOrdersToRoute(contextOf(a.admin), { ...ref, orderIds: [ids.o5] }),
      removeOrderFromRoute(contextOf(a.admin), { ...ref, orderId: ids.o1 }),
      reorderRouteStops(contextOf(a.admin), { ...ref, orderIds: [ids.o1, ids.o2, ids.o3, ids.o4] }),
      updateRoute(contextOf(a.admin), { ...ref, name: "Outro", driverId: a.driver.id, vehicleId: null }),
      releaseRoute(contextOf(a.admin), ref),
    ]) {
      expect((await rejection(attempt)).message).toBe(ROUTE_MESSAGES.frozen);
    }
    expect((await rejection(deleteDraftRoute(contextOf(a.admin), ref))).message).toBe(ROUTE_MESSAGES.notDeletable);
  });

  it("romaneio de carga: soma por produto, peso e vasilhames", async () => {
    const now = new Date("2026-11-17T23:30:00Z");
    const { header, manifest } = await getCargoManifest(contextOf(a.admin), routeId, now);
    expect(header).toMatchObject({
      companyName: "Empresa A",
      routeCode: "R-0002",
      routeVersion: await versionOf(routeId),
      deliveryDate: tomorrow,
      driverName: "Motorista A",
      vehicle: { plate: "ABC1D23", model: "Furgão" },
      generatedAt: formatInstant(now, "America/Sao_Paulo"),
    });
    expect(header.generatedAt).toBe("17/11/2026 20:30");
    // 12 + 12 + 30 + 12 = 66 unidades; 66 × 1,050 kg = 69,3 kg; caixas de 12: 1 + 1 + 3 + 1 = 6.
    expect(manifest.products).toEqual([{ productId: a.product.id, sku: "LEITE-1L", productName: "Leite 1L", unit: "UN", quantityMilli: 66_000, weightGrams: 69_300 }]);
    expect(manifest.containers).toEqual([{ productId: a.container.id, sku: "CAIXA", name: "Caixa retornável", count: 6 }]);
    expect(manifest).toMatchObject({ totalWeightGrams: 69_300, weightIncomplete: false, orderCount: 4 });
  });

  it("romaneio de entrega: paradas na ordem, dados da entrega e saldo anterior de vasilhames", async () => {
    // Saldo do cliente c1: 5 entregues e 2 devolvidos antes; o movimento desta rota não entra.
    await a.db.containerMovement.create({ data: { companyId: a.companyId, customerId: ids.c1, containerProductId: a.container.id, delivered: 5, returned: 2 } });
    await a.db.containerMovement.create({ data: { companyId: a.companyId, customerId: ids.c1, containerProductId: a.container.id, orderId: ids.o1, delivered: 1 } });

    const { stops } = await getDeliveryManifest(contextOf(a.admin), routeId);
    expect(stops.map((s) => s.stopSequence)).toEqual([1, 2, 3, 4]);
    const first = stops.find((s) => s.customerName === "Mercado Bela Vista");
    expect(first).toMatchObject({
      invoiceNumber: "4321",
      addressLine: "Rua das Flores, 200, Jardim Paulista, Ribeirão Preto - SP, 14010-000",
      phone: "5516999990000",
      deliveryWindow: "8h às 11h",
      notes: "Entregar pelos fundos",
      items: [{ productName: "Leite 1L", unit: "UN", quantityMilli: 12_000 }],
      totalCents: 12 * 549,
      amountToCollectCents: 12 * 549,
      paymentMethod: "DINHEIRO",
      containerBalance: [{ sku: "CAIXA", name: "Caixa retornável", balance: 3 }],
    });
    expect(stops.find((s) => s.customerName === "Padaria Sol")).toMatchObject({ paymentMethod: "FATURADO", amountToCollectCents: 0, containerBalance: [] });
  });

  it("romaneios: outra empresa recebe 404; MOTORISTA não imprime", async () => {
    expect((await rejection(getCargoManifest(contextOf(b.admin), routeId))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(getDeliveryManifest(contextOf(b.admin), routeId))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(getCargoManifest(contextOf(a.driver), routeId))).code).toBe("SEM_PERMISSAO");
  });

  it("reabrir: só ADMIN, na versão atual; pedidos voltam a PENDENTE; motivo opcional na auditoria", async () => {
    const version = await versionOf(routeId);
    expect((await rejection(reopenRoute(contextOf(expedicao), { id: routeId, version, reason: null }))).code).toBe("SEM_PERMISSAO");
    expect((await rejection(reopenRoute(contextOf(a.admin), { id: routeId, version: version - 1, reason: null }))).message).toBe(MESSAGES.staleVersion);

    const saved = await reopenRoute(contextOf(a.admin), reopenRouteSchema.parse({ id: routeId, version, reason: "Faltou um pedido" }));
    const route = await prisma.route.findUniqueOrThrow({ where: { id: routeId }, include: { orders: true } });
    expect(route.status).toBe("RASCUNHO");
    expect(route.orders.every((o) => o.status === "PENDENTE")).toBe(true);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { entityId: routeId, action: "ROTA_REABERTA" } })).toMatchObject({
      userId: a.admin.id,
      reason: "Faltou um pedido",
      before: { status: "LIBERADA_CARGA" },
      after: { status: "RASCUNHO" },
    });
    expect((await rejection(reopenRoute(contextOf(a.admin), { id: routeId, version: saved.version, reason: null }))).message).toBe(ROUTE_MESSAGES.notReopenable);

    // Libera e reabre de novo, sem motivo.
    const released = await releaseRoute(contextOf(a.admin), saved);
    await reopenRoute(contextOf(a.admin), reopenRouteSchema.parse({ id: routeId, version: released.version, reason: "" }));
    const audits = await prisma.auditLog.findMany({ where: { entityId: routeId, action: "ROTA_REABERTA" }, orderBy: { createdAt: "asc" } });
    expect(audits.map((x) => x.reason)).toEqual(["Faltou um pedido", null]);
  });
});

describe("excluir rascunho", () => {
  it("pedidos voltam para sem rota, auditoria guarda a composição e o código não é reaproveitado", async () => {
    const version = await versionOf(routeId);
    const orderIds = (await stopsOf(routeId)).map(([id]) => id);
    expect((await rejection(deleteDraftRoute(contextOf(b.admin), { id: routeId, version }))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(deleteDraftRoute(contextOf(a.driver), { id: routeId, version }))).code).toBe("SEM_PERMISSAO");

    await deleteDraftRoute(contextOf(expedicao), { id: routeId, version });
    expect(await prisma.route.count({ where: { id: routeId } })).toBe(0);
    expect(await prisma.order.count({ where: { id: { in: orderIds as string[] }, routeId: null, stopSequence: null, status: "PENDENTE" } })).toBe(4);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { entityId: routeId, action: "ROTA_EXCLUIDA" } })).toMatchObject({
      userId: expedicao.id,
      before: { code: "R-0002", orderIds },
    });

    const next = await createRoute(contextOf(a.admin), routeInput([ids.o1]));
    expect(next.code).toBe("R-0004");
  });
});

describe("configurações da empresa", () => {
  it("só ADMIN lê e altera; alteração auditada", async () => {
    expect((await rejection(getCompanySettings(contextOf(expedicao)))).code).toBe("SEM_PERMISSAO");
    const input = companySettingsSchema.parse({ ...OPERACAO, name: "Empresa A Ltda", cnpj: "11.222.333/0001-81", phone: "(16) 3333-0000" });
    expect((await rejection(updateCompanySettings(contextOf(expedicao), input))).code).toBe("SEM_PERMISSAO");
    expect((await rejection(updateCompanySettings(contextOf(a.admin, "CANCELED"), input))).code).toBe("SOMENTE_LEITURA");

    const saved = await updateCompanySettings(contextOf(a.admin), input);
    expect(saved).toMatchObject({ name: "Empresa A Ltda", cnpj: "11222333000181", phone: "551633330000", depotStreet: null, depotCity: null });
    expect(await getCompanySettings(contextOf(a.admin))).toEqual(saved);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: b.companyId } })).name).toBe("Empresa B");
    expect(await prisma.auditLog.count({ where: { companyId: a.companyId, action: "EMPRESA_ALTERADA" } })).toBe(2);
  });

  it("endereço do depósito: completo ou vazio; latitude e longitude juntas", () => {
    const partial = companySettingsSchema.safeParse({ ...OPERACAO, name: "Empresa", depotStreet: "Rua X" });
    expect(partial.success).toBe(false);
    expect(partial.error?.issues.map((i) => i.path.join("."))).toEqual(
      expect.arrayContaining(["depotZipCode", "depotNumber", "depotNeighborhood", "depotCity", "depotState"]),
    );
    const coords = companySettingsSchema.safeParse({ ...OPERACAO, name: "Empresa", depotLatitude: "-21,17" });
    expect(coords.error?.issues.map((i) => i.path.join("."))).toEqual(["depotLongitude"]);
    expect(companySettingsSchema.parse({ ...OPERACAO, name: "Empresa", depotLatitude: "-21,1767", depotLongitude: "-47.8208" })).toMatchObject({ depotLatitude: -21.1767, depotLongitude: -47.8208 });
  });
});
