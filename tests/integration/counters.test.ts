// Numeração sequencial por empresa (seção 3.6), com concorrência real no Postgres.

import { beforeAll, describe, expect, it } from "vitest";

import { COUNTER_KEYS, nextCounterValue } from "@/lib/counters";
import { prisma } from "@/lib/db";

import { type CompanyFixture, cleanDatabase, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
});

function orderData(fixture: CompanyFixture, orderNumber: number) {
  return {
    companyId: fixture.companyId,
    orderNumber,
    customerId: fixture.customer.id,
    deliveryDate: new Date("2026-11-17T00:00:00Z"),
    deliveryZipCode: "14010000",
    deliveryStreet: "Rua Um",
    deliveryNumber: "10",
    deliveryNeighborhood: "Centro",
    deliveryCity: "Ribeirão Preto",
    deliveryState: "SP",
    deliveryNeighborhoodKey: "centro",
    deliveryCityKey: "ribeirao preto",
    paymentMethod: "BOLETO" as const,
    totalCents: 0,
    amountToCollectCents: 0,
    paymentStatus: "FATURADO" as const,
  };
}

/** O mesmo que a action de criar pedido fará: número e pedido na MESMA transação. */
function createNumberedOrder(fixture: CompanyFixture): Promise<number> {
  return fixture.db.$transaction(async (tx) => {
    const orderNumber = await nextCounterValue(tx, fixture.companyId, COUNTER_KEYS.order);
    await tx.order.create({ data: orderData(fixture, orderNumber) });
    return orderNumber;
  });
}

describe("nextCounterValue", () => {
  it("25 pedidos criados em paralelo recebem 25 números diferentes e consecutivos", async () => {
    // A fixture já usou o nº 1.
    const numbers = await Promise.all(Array.from({ length: 25 }, () => createNumberedOrder(a)));
    expect([...numbers].sort((x, y) => x - y)).toEqual(Array.from({ length: 25 }, (_, i) => i + 2));
    expect(await prisma.order.count({ where: { companyId: a.companyId } })).toBe(26);
  });

  it("cada empresa tem a própria sequência", async () => {
    expect(await createNumberedOrder(b)).toBe(2);
    expect(await createNumberedOrder(a)).toBe(27);
  });

  it("primeiro uso de uma sequência em paralelo (linha do contador ainda não existe)", async () => {
    expect(await prisma.companyCounter.count({ where: { companyId: a.companyId, key: COUNTER_KEYS.route } })).toBe(0);
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () => a.db.$transaction((tx) => nextCounterValue(tx, a.companyId, COUNTER_KEYS.route))),
    );
    expect([...numbers].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("se a transação falha, o número não é consumido", async () => {
    const before = await prisma.companyCounter.findUniqueOrThrow({ where: { companyId_key: { companyId: a.companyId, key: COUNTER_KEYS.order } } });
    await expect(
      a.db.$transaction(async (tx) => {
        await nextCounterValue(tx, a.companyId, COUNTER_KEYS.order);
        throw new Error("falha de validação depois de pegar o número");
      }),
    ).rejects.toThrow("falha de validação");
    const after = await prisma.companyCounter.findUniqueOrThrow({ where: { companyId_key: { companyId: a.companyId, key: COUNTER_KEYS.order } } });
    expect(after.value).toBe(before.value);
  });

  it("uma empresa não consegue avançar a sequência de outra", async () => {
    const before = await prisma.companyCounter.findUniqueOrThrow({ where: { companyId_key: { companyId: a.companyId, key: COUNTER_KEYS.order } } });
    await expect(nextCounterValue(b.db, a.companyId, COUNTER_KEYS.order)).rejects.toThrow();
    const after = await prisma.companyCounter.findUniqueOrThrow({ where: { companyId_key: { companyId: a.companyId, key: COUNTER_KEYS.order } } });
    expect(after.value).toBe(before.value);
  });

  it("o banco recusa número de pedido repetido na mesma empresa", async () => {
    await expect(a.db.order.create({ data: orderData(a, 1) })).rejects.toMatchObject({ code: "P2002" });
  });
});
