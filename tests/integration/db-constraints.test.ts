// Regras garantidas pelo próprio banco (migration inicial), independentes do código do app.

import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";

import { type CompanyFixture, cleanDatabase, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
});

const DATE = new Date("2026-11-16T00:00:00Z");

describe("rotas", () => {
  it("um motorista não pode ter duas rotas EM_ANDAMENTO ao mesmo tempo", async () => {
    await a.db.route.update({ where: { id: a.route.id }, data: { status: "EM_ANDAMENTO" } });
    const second = await a.db.route.create({
      data: { companyId: a.companyId, code: "R-0002", name: "Segunda", deliveryDate: DATE, driverId: a.driver.id, status: "LIBERADA_CARGA" },
    });
    await expect(a.db.route.update({ where: { id: second.id }, data: { status: "EM_ANDAMENTO" } })).rejects.toMatchObject({ code: "P2002" });

    // Depois que a primeira sai de EM_ANDAMENTO, a segunda pode começar.
    await a.db.route.update({ where: { id: a.route.id }, data: { status: "AGUARDANDO_ACERTO" } });
    await expect(a.db.route.update({ where: { id: second.id }, data: { status: "EM_ANDAMENTO" } })).resolves.toMatchObject({ status: "EM_ANDAMENTO" });
  });

  it("motoristas de empresas diferentes não interferem entre si", async () => {
    await expect(b.db.route.update({ where: { id: b.route.id }, data: { status: "EM_ANDAMENTO" } })).resolves.toMatchObject({ status: "EM_ANDAMENTO" });
  });

  it("código de rota é único por empresa", async () => {
    await expect(
      a.db.route.create({ data: { companyId: a.companyId, code: "R-0001", name: "Repetida", deliveryDate: DATE, driverId: a.driver.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("unicidade", () => {
  it("SKU e placa são únicos por empresa", async () => {
    await expect(a.db.product.create({ data: { companyId: a.companyId, sku: "LEITE-1L", name: "Outro", unit: "UN", priceCents: 1 } })).rejects.toMatchObject({ code: "P2002" });
    await expect(a.db.vehicle.create({ data: { companyId: a.companyId, plate: "ABC1D23", model: "Outro" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("e-mail de usuário é único em todo o sistema", async () => {
    await expect(
      b.db.user.create({ data: { companyId: b.companyId, name: "Clone", email: a.admin.email, passwordHash: "x", role: "ADMIN" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("um template recorrente gera no máximo um pedido por data (idempotência do gerador)", async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } });
    const { id: _id, orderNumber: _n, createdAt: _c, updatedAt: _u, routeId: _r, stopSequence: _s, ...copy } = order;
    void [_id, _n, _c, _u, _r, _s];
    await expect(a.db.order.create({ data: { ...copy, orderNumber: 901 } })).rejects.toMatchObject({ code: "P2002" });
    // Em outra data o mesmo template pode gerar outro pedido.
    await expect(a.db.order.create({ data: { ...copy, orderNumber: 902, deliveryDate: new Date("2026-11-23T00:00:00Z") } })).resolves.toMatchObject({ orderNumber: 902 });
    // Pedidos avulsos (sem template) não entram na regra.
    await expect(a.db.order.create({ data: { ...copy, orderNumber: 903, recurringTemplateId: null } })).resolves.toMatchObject({ orderNumber: 903 });
    await expect(a.db.order.create({ data: { ...copy, orderNumber: 904, recurringTemplateId: null } })).resolves.toMatchObject({ orderNumber: 904 });
  });

  it("um pedido tem no máximo um comprovante, e o clientRequestId não se repete na empresa", async () => {
    const proof = { companyId: a.companyId, outcome: "ENTREGUE" as const, deliveredAt: new Date(), photoFileKeys: [], recordedById: a.driver.id };
    await expect(a.db.deliveryProof.create({ data: { ...proof, orderId: a.order.id, clientRequestId: randomUUID() } })).rejects.toMatchObject({ code: "P2002" });

    const other = await prisma.order.findFirstOrThrow({ where: { companyId: a.companyId, orderNumber: 903 } });
    await expect(a.db.deliveryProof.create({ data: { ...proof, orderId: other.id, clientRequestId: a.proof.clientRequestId } })).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("valores", () => {
  it("nenhum valor em centavos pode ser negativo", async () => {
    await expect(a.db.product.update({ where: { id: a.product.id }, data: { priceCents: -1 } })).rejects.toThrow();
    await expect(a.db.order.update({ where: { id: a.order.id }, data: { totalCents: -1 } })).rejects.toThrow();
    await expect(a.db.order.update({ where: { id: a.order.id }, data: { amountToCollectCents: -1 } })).rejects.toThrow();
    await expect(a.db.orderItem.update({ where: { id: a.orderItem.id }, data: { subtotalCents: -1 } })).rejects.toThrow();
    await expect(a.db.deliveryProof.update({ where: { id: a.proof.id }, data: { cashCollectedCents: -1 } })).rejects.toThrow();
    await expect(a.db.deliveryProof.update({ where: { id: a.proof.id }, data: { pixCollectedCents: -1 } })).rejects.toThrow();
    await expect(a.db.route.update({ where: { id: a.route.id }, data: { cashHandedInCents: -1 } })).rejects.toThrow();
  });

  it("quantidade precisa ser positiva, e a entregue não passa da pedida", async () => {
    await expect(a.db.orderItem.update({ where: { id: a.orderItem.id }, data: { quantity: "0" } })).rejects.toThrow();
    await expect(a.db.orderItem.update({ where: { id: a.orderItem.id }, data: { deliveredQuantity: "12.001" } })).rejects.toThrow();
    await expect(a.db.orderItem.update({ where: { id: a.orderItem.id }, data: { deliveredQuantity: "-1" } })).rejects.toThrow();
    await expect(a.db.orderItem.update({ where: { id: a.orderItem.id }, data: { deliveredQuantity: "0" } })).resolves.toBeTruthy();
    await expect(a.db.orderItem.update({ where: { id: a.orderItem.id }, data: { deliveredQuantity: "11.500" } })).resolves.toBeTruthy();
  });

  it("quantidade fracionada é gravada com 3 casas, sem perda", async () => {
    const item = await a.db.orderItem.update({ where: { id: a.orderItem.id }, data: { quantity: "2.750", deliveredQuantity: null } });
    expect(item.quantity.toFixed(3)).toBe("2.750");
  });

  it("data de entrega volta do banco como o mesmo dia de calendário", async () => {
    const order = await a.db.order.findUniqueOrThrow({ where: { id: a.order.id } });
    expect(order.deliveryDate.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });

  it("contagem de vasilhames não pode ser negativa", async () => {
    await expect(a.db.containerMovement.update({ where: { id: a.movement.id }, data: { returned: -1 } })).rejects.toThrow();
  });
});

describe("registros com vínculo não são apagados", () => {
  it("cliente, produto e motorista com pedidos ou rotas não podem ser excluídos", async () => {
    await expect(a.db.customer.delete({ where: { id: a.customer.id } })).rejects.toThrow();
    await expect(a.db.product.delete({ where: { id: a.product.id } })).rejects.toThrow();
    await expect(a.db.user.delete({ where: { id: a.driver.id } })).rejects.toThrow();
    expect(await prisma.customer.count({ where: { id: a.customer.id } })).toBe(1);
  });
});
