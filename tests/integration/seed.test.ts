// O seed de demonstração (seção 8) roda de verdade contra o banco e o bucket de teste.

import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, dateStringToDbDate, dayOfWeekOfDateString, todayInTimeZone } from "@/domain/dates";
import { normalizeKey } from "@/domain/normalize";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { getCargoManifest } from "@/lib/services/manifests";
import { createRoute, getRoutePlanning, releaseRoute } from "@/lib/services/routes";
import { statObject } from "@/lib/storage";
import { createRouteSchema } from "@/lib/validation/routes";

import { cleanDatabase } from "./fixtures";

function runSeed(extraEnv: Record<string, string> = {}) {
  return spawnSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], { env: { ...process.env, ...extraEnv }, encoding: "utf8", shell: process.platform === "win32" });
}

const today = todayInTimeZone("America/Sao_Paulo");
const yesterday = addDays(today, -1);
let output = "";
let mainCompanyId = "";

beforeAll(async () => {
  await cleanDatabase();
  const result = runSeed();
  output = `${result.stdout}\n${result.stderr}`;
  expect(result.status, output).toBe(0);
  mainCompanyId = (await prisma.company.findFirstOrThrow({ where: { name: "Distribuidora Exemplo" } })).id;
});

describe("seed de demonstração", () => {
  it("imprime as credenciais no terminal", () => {
    expect(output).toContain("admin@exemplo.test");
    expect(output).toContain("motorista1@exemplo.test");
    expect(output).toContain("admin@vizinha.test");
    expect(output).toContain("fecharota123");
  });

  it("cria 2 empresas com dados próprios", async () => {
    const companies = await prisma.company.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true, customers: true, products: true, orders: true, vehicles: true } } } });
    expect(companies.map((c) => c.name)).toEqual(["Distribuidora Exemplo", "Distribuidora Vizinha"]);
    expect(companies[0]?._count).toEqual({ users: 4, customers: 12, products: 8, orders: 16, vehicles: 2 });
    expect(companies[1]?._count).toEqual({ users: 2, customers: 2, products: 3, orders: 2, vehicles: 1 });
  });

  it("usuários: 1 ADMIN, 1 EXPEDICAO e 2 MOTORISTAS, com senha em hash", async () => {
    const users = await prisma.user.findMany({ where: { companyId: mainCompanyId }, omit: { passwordHash: false } });
    const byRole = (role: string) => users.filter((u) => u.role === role).length;
    expect([byRole("ADMIN"), byRole("EXPEDICAO"), byRole("MOTORISTA")]).toEqual([1, 1, 2]);
    const admin = users.find((u) => u.role === "ADMIN");
    expect(admin?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("fecharota123", admin?.passwordHash ?? "")).toBe(true);
    expect(await verifyPassword("senha-errada", admin?.passwordHash ?? "")).toBe(false);
  });

  it("produtos: 6 vendáveis (1 em KG, pelo menos 2 em vasilhame) + 2 retornáveis", async () => {
    const products = await prisma.product.findMany({ where: { companyId: mainCompanyId } });
    expect(products.filter((p) => p.isReturnableContainer)).toHaveLength(2);
    expect(products.filter((p) => !p.isReturnableContainer)).toHaveLength(6);
    expect(products.filter((p) => p.unit === "KG")).toHaveLength(1);
    expect(products.filter((p) => p.containerProductId !== null).length).toBeGreaterThanOrEqual(2);
  });

  it("clientes: grafias inconsistentes de bairro caem no mesmo grupo", async () => {
    const customers = await prisma.customer.findMany({ where: { companyId: mainCompanyId } });
    const groups = new Map<string, Set<string>>();
    for (const c of customers) {
      expect(c.neighborhoodKey).toBe(normalizeKey(c.neighborhood));
      expect(c.cityKey).toBe(normalizeKey(c.city));
      const key = `${c.cityKey}|${c.neighborhoodKey}`;
      groups.set(key, (groups.get(key) ?? new Set()).add(c.neighborhood));
    }
    expect([...groups.keys()].sort()).toEqual([
      "ribeirao preto|centro",
      "ribeirao preto|jardim paulista",
      "ribeirao preto|vila tiberio",
      "sertaozinho|centro",
    ]);
    expect(groups.get("ribeirao preto|centro")?.size).toBeGreaterThanOrEqual(3);
    expect(new Set(customers.map((c) => c.defaultPaymentMethod))).toEqual(new Set(["PIX", "DINHEIRO", "BOLETO", "FATURADO"]));
  });

  it("12 pedidos PENDENTE para hoje, com totais calculados e snapshot de endereço", async () => {
    const orders = await prisma.order.findMany({ where: { companyId: mainCompanyId, deliveryDate: dateStringToDbDate(today) }, include: { items: true, customer: true } });
    expect(orders).toHaveLength(12);
    for (const order of orders) {
      expect(order.status).toBe("PENDENTE");
      expect(order.routeId).toBeNull();
      expect(order.totalCents).toBe(order.items.reduce((sum, item) => sum + item.subtotalCents, 0));
      const collects = order.paymentMethod === "PIX" || order.paymentMethod === "DINHEIRO";
      expect(order.amountToCollectCents).toBe(collects ? order.totalCents : 0);
      expect(order.paymentStatus).toBe(collects ? "A_RECEBER" : "FATURADO");
      expect(order.deliveryStreet).toBe(order.customer.street);
      expect(order.deliveryNeighborhoodKey).toBe(order.customer.neighborhoodKey);
    }
    const fractional = orders.flatMap((o) => o.items).filter((item) => item.unit === "KG" && item.quantity.toFixed(3).slice(-3) !== "000");
    expect(fractional.length).toBeGreaterThanOrEqual(1);
  });

  it("5 templates: 2 caem hoje e 1 deles já gerou o pedido de hoje", async () => {
    const templates = await prisma.recurringOrderTemplate.findMany({ where: { companyId: mainCompanyId }, include: { orders: true, items: true } });
    expect(templates).toHaveLength(5);
    const dueToday = templates.filter((t) => t.dayOfWeek === dayOfWeekOfDateString(today));
    expect(dueToday).toHaveLength(2);
    expect(dueToday.map((t) => t.orders.length).sort()).toEqual([0, 1]);
    expect(templates.filter((t) => t.pausedUntil !== null)).toHaveLength(1);
    expect(templates.every((t) => t.items.length >= 1)).toBe(true);
  });

  it("rota de ontem CONCLUIDA, com parcial, não entregue, comprovantes e vasilhames", async () => {
    const route = await prisma.route.findFirstOrThrow({ where: { companyId: mainCompanyId }, include: { orders: { include: { deliveryProof: true, items: true }, orderBy: { stopSequence: "asc" } }, containerMovements: true } });
    expect(route.status).toBe("CONCLUIDA");
    expect(route.code).toBe("R-0001");
    expect(route.deliveryDate).toEqual(dateStringToDbDate(yesterday));
    expect(route.closedAt).not.toBeNull();
    expect(route.orders.map((o) => o.status)).toEqual(["ENTREGUE", "ENTREGUE", "ENTREGUE_PARCIAL", "NAO_ENTREGUE"]);
    expect(route.orders.map((o) => o.stopSequence)).toEqual([1, 2, 3, 4]);
    expect(route.orders.every((o) => o.deliveryProof !== null)).toBe(true);
    expect(route.containerMovements.length).toBeGreaterThanOrEqual(3);

    const cash = route.orders.reduce((sum, o) => sum + (o.deliveryProof?.cashCollectedCents ?? 0), 0);
    expect(route.cashHandedInCents).toBe(cash);

    const partial = route.orders[2];
    expect(partial?.items.some((item) => item.deliveredQuantity !== null && item.deliveredQuantity.lessThan(item.quantity) && item.returnReason)).toBe(true);
    const failed = route.orders[3];
    expect(failed?.deliveryProof?.failureReason).toBe("ESTABELECIMENTO_FECHADO");
    expect(failed?.items.every((item) => item.deliveredQuantity?.isZero())).toBe(true);
  });

  it("os arquivos dos comprovantes existem no storage, no prefixo da empresa", async () => {
    const files = await prisma.fileObject.findMany({ where: { companyId: mainCompanyId } });
    expect(files.length).toBeGreaterThanOrEqual(5);
    const proofs = await prisma.deliveryProof.findMany({ where: { companyId: mainCompanyId } });
    const referenced = proofs.flatMap((p) => [...p.photoFileKeys, ...(p.signatureFileKey ? [p.signatureFileKey] : [])]);
    expect(new Set(referenced)).toEqual(new Set(files.map((f) => f.key)));
    for (const file of files) {
      expect(file.status).toBe("CONFIRMED");
      expect(file.key.startsWith(`companies/${mainCompanyId}/proofs/`)).toBe(true);
      expect(await statObject({ companyId: mainCompanyId, key: file.key })).toEqual({ sizeBytes: file.sizeBytes, contentType: "image/png" });
    }
  });

  it("os contadores ficam no último número usado", async () => {
    const counters = await prisma.companyCounter.findMany({ where: { companyId: mainCompanyId } });
    expect(Object.fromEntries(counters.map((c) => [c.key, c.value]))).toEqual({ order: 16, route: 1 });
    const max = await prisma.order.aggregate({ where: { companyId: mainCompanyId }, _max: { orderNumber: true } });
    expect(max._max.orderNumber).toBe(16);
  });

  it("a empresa principal tem endereço do depósito (partida do Google Maps)", async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: mainCompanyId } });
    expect(company).toMatchObject({ depotStreet: "Avenida Dom Pedro I", depotNumber: "1500", depotCity: "Ribeirão Preto", depotState: "SP", depotZipCode: "14075000" });
  });

  it("aceite da Fase 4: romaneio de carga dos 12 pedidos de hoje bate com a soma manual", async () => {
    const expedicao = await prisma.user.findFirstOrThrow({ where: { companyId: mainCompanyId, role: "EXPEDICAO" } });
    const driver = await prisma.user.findFirstOrThrow({ where: { companyId: mainCompanyId, role: "MOTORISTA" }, orderBy: { email: "asc" } });
    const ctx = { userId: expedicao.id, companyId: mainCompanyId, role: "EXPEDICAO" as const, planStatus: "TRIAL" as const, timezone: "America/Sao_Paulo" };
    const planning = await getRoutePlanning(ctx, today);
    const orderIds = planning.groups.flatMap((city) => city.neighborhoods.flatMap((n) => n.orders.map((o) => o.id)));
    expect(orderIds).toHaveLength(12);

    const created = await createRoute(ctx, createRouteSchema.parse({ deliveryDate: today, name: "Todos de hoje", driverId: driver.id, orderIds }));
    const released = await releaseRoute(ctx, created);
    const { header, manifest } = await getCargoManifest(ctx, released.id);
    expect(header).toMatchObject({ companyName: "Distribuidora Exemplo", routeCode: "R-0002", routeVersion: released.version, deliveryDate: today });

    // Soma manual dos itens dos 12 pedidos do seed (quantidade e peso por produto).
    const lines = manifest.products.map((p) => [p.sku, p.quantityMilli / 1000, (p.weightGrams ?? 0) / 1000]);
    expect(lines).toEqual([
      ["CERV-600-CX", 14, 336],
      ["IOG-170", 156, 28.08],
      ["LEITE-1L", 210, 220.5],
      ["OVOS-DZ", 49, 35.28],
      ["QJ-MUSS", 27.25, 27.25],
      ["REFRI-2L-FD", 22, 277.2],
    ]);
    expect(manifest.totalWeightGrams).toBe(924_310);
    expect(manifest.weightIncomplete).toBe(false);
    expect(manifest.containers.map((c) => [c.sku, c.count])).toEqual([
      ["CAIXA-PLAST", 25],
      ["ENGRADADO", 14],
    ]);

    // Conferência independente: a mesma soma feita direto no banco.
    const sums = await prisma.orderItem.groupBy({ by: ["productId"], where: { order: { routeId: released.id } }, _sum: { quantity: true } });
    const products = await prisma.product.findMany({ where: { id: { in: sums.map((s) => s.productId) } } });
    for (const sum of sums) {
      const sku = products.find((p) => p.id === sum.productId)?.sku;
      expect(manifest.products.find((p) => p.sku === sku)?.quantityMilli).toBe(Math.round(Number(sum._sum.quantity) * 1000));
    }
  });

  it("recusa rodar de novo sobre um banco com dados", async () => {
    const result = runSeed();
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("O banco já tem dados");
    expect(await prisma.company.count()).toBe(2);
  });

  it("recusa rodar em produção, mesmo com o banco vazio", async () => {
    await cleanDatabase();
    const result = runSeed({ VERCEL_ENV: "production" });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("não roda em produção");
    expect(await prisma.company.count()).toBe(0);
  });
});
