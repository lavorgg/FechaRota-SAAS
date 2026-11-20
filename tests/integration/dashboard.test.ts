// Dashboard (seção 5.3) e rotas do motorista conferidos contra o seed de demonstração.

import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, dateStringToDbDate, todayInTimeZone } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { getDashboard } from "@/lib/services/dashboard";
import { listDriverRoutesForToday } from "@/lib/services/driver-routes";

import { cleanDatabase, contextOf } from "./fixtures";

const today = todayInTimeZone("America/Sao_Paulo");
const yesterday = addDays(today, -1);

async function userByEmail(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, companyId: user.companyId, role: user.role };
}

beforeAll(async () => {
  await cleanDatabase();
  const seed = spawnSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], { env: process.env, encoding: "utf8", shell: process.platform === "win32" });
  expect(seed.status, `${seed.stdout}\n${seed.stderr}`).toBe(0);
});

describe("dashboard com o seed", () => {
  it("hoje: 12 pedidos pendentes sem rota, nada recebido, 1 recorrente não gerado", async () => {
    const admin = await userByEmail("admin@exemplo.test");
    const { summary, alerts } = await getDashboard(contextOf(admin), today);

    expect(summary.orders.total).toBe(12);
    expect(summary.orders.byStatus.PENDENTE).toBe(12);
    expect(summary.pendingWithoutRoute).toBe(12);
    expect(summary.deliveries).toEqual({ completed: 0, pending: 12, notDelivered: 0 });
    expect(summary.money.receivedCents).toBe(0);
    expect(summary.routes.total).toBe(0);

    // Valor a receber = soma do valor a cobrar dos pedidos de hoje (conferido direto no banco).
    const expected = await prisma.order.aggregate({ where: { companyId: admin.companyId, deliveryDate: dateStringToDbDate(today) }, _sum: { amountToCollectCents: true } });
    expect(summary.money.toCollectCents).toBe(expected._sum.amountToCollectCents);

    expect(alerts.templatesNotGenerated.map((t) => t.customerName)).toEqual(["Bar e Mercearia do Tonho"]);
    expect(alerts.notDeliveredWithoutReschedule.total).toBe(1);
    expect(alerts.notDeliveredWithoutReschedule.items[0]).toMatchObject({ orderNumber: 4, customerName: "Lanchonete Ponto Certo", deliveryDate: yesterday });
    expect(alerts.overdueSettlements).toEqual([]);
  });

  it("ontem: rota concluída com entregue, parcial e não entregue; dinheiro e Pix conferido", async () => {
    const expedicao = await userByEmail("expedicao@exemplo.test");
    const { summary, alerts } = await getDashboard(contextOf(expedicao), yesterday);

    expect(summary.orders.total).toBe(4);
    expect(summary.orders.byStatus).toMatchObject({ ENTREGUE: 2, ENTREGUE_PARCIAL: 1, NAO_ENTREGUE: 1 });
    expect(summary.deliveries).toEqual({ completed: 3, pending: 0, notDelivered: 1 });
    expect(summary.routes.byStatus.CONCLUIDA).toBe(1);
    // Pedido 1: R$ 250,76 em dinheiro. Pedido 2: R$ 415,70 em Pix já conferido. Pedido 3: boleto.
    // Pedido 4 (não entregue): R$ 156,15 a receber, nada recebido.
    expect(summary.money).toEqual({
      toCollectCents: 25076 + 41570 + 0 + 15615,
      receivedCashCents: 25076,
      receivedPixCents: 41570,
      receivedCents: 25076 + 41570,
      pixToConfirmCents: 0,
    });
    expect(alerts.templatesNotGenerated).toEqual([]);
  });

  it("a outra empresa não enxerga nada da Distribuidora Exemplo", async () => {
    const neighbor = await userByEmail("admin@vizinha.test");
    const { summary, alerts } = await getDashboard(contextOf(neighbor), yesterday);
    expect(summary.orders.total).toBe(0);
    expect(alerts.notDeliveredWithoutReschedule.total).toBe(0);
    const todayNeighbor = await getDashboard(contextOf(neighbor), today);
    expect(todayNeighbor.summary.orders.total).toBe(2);
    expect(todayNeighbor.alerts.templatesNotGenerated).toEqual([]);
  });

  it("motorista não vê o dashboard", async () => {
    const driver = await userByEmail("motorista1@exemplo.test");
    await expect(getDashboard(contextOf(driver), today)).rejects.toMatchObject({ code: "SEM_PERMISSAO" });
  });

  it("rota aguardando acerto há mais de 12 horas entra no alerta", async () => {
    const admin = await userByEmail("admin@exemplo.test");
    const route = await prisma.route.findFirstOrThrow({ where: { companyId: admin.companyId } });
    const finishedAt = new Date(Date.now() - 13 * 3600_000);
    await prisma.route.update({ where: { id: route.id }, data: { status: "AGUARDANDO_ACERTO", finishedAt } });
    try {
      const { alerts } = await getDashboard(contextOf(admin), today);
      expect(alerts.overdueSettlements).toEqual([{ id: route.id, code: route.code, name: route.name, deliveryDate: yesterday }]);
    } finally {
      await prisma.route.update({ where: { id: route.id }, data: { status: "CONCLUIDA" } });
    }
  });
});

describe("rotas do motorista", () => {
  it("vê só as rotas atribuídas a ele, na data de hoje", async () => {
    const driver1 = await userByEmail("motorista1@exemplo.test");
    const driver2 = await userByEmail("motorista2@exemplo.test");
    const company = await prisma.company.findUniqueOrThrow({ where: { id: driver1.companyId } });
    const route = await prisma.route.create({
      data: { companyId: company.id, code: "R-0900", name: "Hoje centro", deliveryDate: dateStringToDbDate(today), driverId: driver1.id, status: "LIBERADA_CARGA" },
    });

    const mine = await listDriverRoutesForToday(contextOf(driver1));
    expect(mine.date).toBe(today);
    expect(mine.routes.map((r) => r.code)).toEqual(["R-0900"]);
    expect((await listDriverRoutesForToday(contextOf(driver2))).routes).toEqual([]);

    // A rota concluída de ontem não aparece em "hoje".
    expect(mine.routes.some((r) => r.status === "CONCLUIDA")).toBe(false);
    await prisma.route.delete({ where: { id: route.id } });
  });

  it("EXPEDICAO não tem área do motorista", async () => {
    const expedicao = await userByEmail("expedicao@exemplo.test");
    await expect(listDriverRoutesForToday(contextOf(expedicao))).rejects.toMatchObject({ code: "SEM_PERMISSAO" });
  });
});
