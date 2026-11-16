// Isolamento entre empresas (seção 3.4), contra o Postgres real.
// Com duas empresas no banco, a empresa B não lê, lista, conta, edita nem apaga nada da A,
// em NENHUMA tabela de negócio. As fases seguintes repetem isto para cada action e handler.

import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { getTenantDb } from "@/lib/tenant-db";
import { TENANT_MODELS, TenantIsolationError } from "@/lib/tenant-scope";

import { type CompanyFixture, cleanDatabase, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
});

type ModelName = (typeof TENANT_MODELS)[number];
type AnyDelegate = {
  findMany(args?: unknown): Promise<unknown[]>;
  findFirst(args?: unknown): Promise<unknown>;
  count(args?: unknown): Promise<number>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args?: unknown): Promise<{ count: number }>;
};

/** Para cada tabela de negócio: o filtro que identifica a linha da empresa e um update inofensivo. */
function rowOf(fixture: CompanyFixture): Record<ModelName, { where: Record<string, unknown>; touch: Record<string, unknown> }> {
  return {
    User: { where: { id: fixture.admin.id }, touch: { name: "invadido" } },
    // A chave do contador se repete em toda empresa: a linha só é identificada junto com o companyId.
    CompanyCounter: { where: { companyId: fixture.companyId, key: fixture.counter.key }, touch: { value: 999 } },
    Vehicle: { where: { id: fixture.vehicle.id }, touch: { model: "invadido" } },
    Customer: { where: { id: fixture.customer.id }, touch: { name: "invadido" } },
    Product: { where: { id: fixture.product.id }, touch: { name: "invadido" } },
    RecurringOrderTemplate: { where: { id: fixture.template.id }, touch: { notes: "invadido" } },
    RecurringOrderTemplateItem: { where: { id: fixture.templateItem.id }, touch: { unitPriceCents: 1 } },
    Order: { where: { id: fixture.order.id }, touch: { notes: "invadido" } },
    OrderItem: { where: { id: fixture.orderItem.id }, touch: { productName: "invadido" } },
    Route: { where: { id: fixture.route.id }, touch: { name: "invadido" } },
    DeliveryProof: { where: { id: fixture.proof.id }, touch: { receiverName: "invadido" } },
    ContainerMovement: { where: { id: fixture.movement.id }, touch: { returned: 99 } },
    FileObject: { where: { key: fixture.file.key }, touch: { sizeBytes: 1 } },
    AuditLog: { where: { id: fixture.audit.id }, touch: { action: "invadido" } },
  };
}

function delegateOf(db: CompanyFixture["db"], model: ModelName): AnyDelegate {
  const key = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
  return (db as unknown as Record<string, AnyDelegate>)[key] as AnyDelegate;
}

async function snapshot(model: ModelName, companyId: string): Promise<string> {
  const key = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
  const rows = await (prisma as unknown as Record<string, AnyDelegate>)[key]?.findMany({ where: { companyId } });
  return JSON.stringify(rows, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
}

describe.each(TENANT_MODELS)("%s", (model) => {
  it("a empresa A enxerga a própria linha (o teste não passa por acaso)", async () => {
    const own = delegateOf(a.db, model);
    expect(await own.findFirst({ where: rowOf(a)[model].where })).not.toBeNull();
    expect(await own.count()).toBeGreaterThanOrEqual(1);
  });

  it("a empresa B não lê, não lista e não conta linhas da A", async () => {
    const intruder = delegateOf(b.db, model);
    const target = rowOf(a)[model].where;

    expect(await intruder.findFirst({ where: target })).toBeNull();
    expect(await intruder.findMany({ where: target })).toEqual([]);
    expect(await intruder.count({ where: target })).toBe(0);

    // Mesmo pedindo explicitamente o companyId da A, ou usando OR.
    expect(await intruder.findMany({ where: { companyId: a.companyId } })).toEqual([]);
    expect(await intruder.findMany({ where: { OR: [{ companyId: a.companyId }, target] } })).toEqual([]);

    // Listar tudo devolve só linhas da própria B.
    const all = (await intruder.findMany()) as Array<{ companyId: string }>;
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.every((row) => row.companyId === b.companyId)).toBe(true);
    expect(await intruder.count()).toBe(all.length);
  });

  it("a empresa B não edita nem apaga linhas da A", async () => {
    const intruder = delegateOf(b.db, model);
    const { where, touch } = rowOf(a)[model];
    const before = await snapshot(model, a.companyId);

    expect(await intruder.updateMany({ where, data: touch })).toEqual({ count: 0 });
    expect(await intruder.updateMany({ where: { companyId: a.companyId }, data: touch })).toEqual({ count: 0 });
    expect(await intruder.deleteMany({ where })).toEqual({ count: 0 });
    expect(await intruder.deleteMany({ where: { companyId: a.companyId } })).toEqual({ count: 0 });

    expect(await snapshot(model, a.companyId)).toBe(before);
  });
});

describe("operações por chave única", () => {
  it("findUnique de id de outra empresa devolve null (vira 404, não 403)", async () => {
    expect(await b.db.order.findUnique({ where: { id: a.order.id } })).toBeNull();
    expect(await b.db.customer.findUnique({ where: { id: a.customer.id } })).toBeNull();
    expect(await b.db.fileObject.findUnique({ where: { key: a.file.key } })).toBeNull();
    await expect(b.db.route.findUniqueOrThrow({ where: { id: a.route.id } })).rejects.toMatchObject({ code: "P2025" });
  });

  it("update e delete de id de outra empresa falham como registro não encontrado", async () => {
    await expect(b.db.order.update({ where: { id: a.order.id }, data: { notes: "invadido" } })).rejects.toMatchObject({ code: "P2025" });
    await expect(b.db.vehicle.delete({ where: { id: a.vehicle.id } })).rejects.toMatchObject({ code: "P2025" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).notes).toBeNull();
    expect(await prisma.vehicle.count({ where: { id: a.vehicle.id } })).toBe(1);
  });

  it("upsert com id de outra empresa não altera a linha da A", async () => {
    await expect(
      b.db.vehicle.upsert({
        where: { id: a.vehicle.id },
        update: { model: "invadido" },
        create: { id: a.vehicle.id, companyId: b.companyId, plate: "ZZZ9Z99", model: "clone" },
      }),
    ).rejects.toThrow();
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: a.vehicle.id } })).model).toBe("Furgão");
  });

  it("include não atravessa empresas", async () => {
    const orders = await b.db.order.findMany({ include: { customer: true, items: true, route: true, deliveryProof: true } });
    expect(orders).toHaveLength(1);
    for (const order of orders) {
      expect(order.customer.companyId).toBe(b.companyId);
      expect(order.route?.companyId).toBe(b.companyId);
      expect(order.deliveryProof?.companyId).toBe(b.companyId);
      expect(order.items.every((item) => item.companyId === b.companyId)).toBe(true);
    }
  });
});

describe("relações entre empresas (barreira do banco)", () => {
  const orderData = (companyId: string, customerId: string) => ({
    companyId,
    orderNumber: 500 + Math.floor(Math.random() * 100000),
    customerId,
    deliveryDate: new Date("2026-11-16T00:00:00Z"),
    deliveryZipCode: "14010000",
    deliveryStreet: "Rua Um",
    deliveryNumber: "10",
    deliveryNeighborhood: "Centro",
    deliveryCity: "Ribeirão Preto",
    deliveryState: "SP",
    deliveryNeighborhoodKey: "centro",
    deliveryCityKey: "ribeirao preto",
    paymentMethod: "DINHEIRO" as const,
    totalCents: 0,
    amountToCollectCents: 0,
    paymentStatus: "A_RECEBER" as const,
  });

  it("B não cria pedido para cliente da A", async () => {
    await expect(b.db.order.create({ data: orderData(b.companyId, a.customer.id) })).rejects.toMatchObject({ code: "P2003" });
  });

  it("B não coloca o próprio pedido numa rota da A", async () => {
    await expect(b.db.order.update({ where: { id: b.order.id }, data: { routeId: a.route.id } })).rejects.toMatchObject({ code: "P2003" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: b.order.id } })).routeId).toBe(b.route.id);
  });

  it("B não cria item com produto da A, nem rota com motorista ou veículo da A", async () => {
    await expect(
      b.db.orderItem.create({
        data: { companyId: b.companyId, orderId: b.order.id, productId: a.product.id, productName: "x", unit: "UN", quantity: "1.000", unitPriceCents: 1, subtotalCents: 1 },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    const route = { companyId: b.companyId, name: "x", deliveryDate: new Date("2026-11-16T00:00:00Z") };
    await expect(b.db.route.create({ data: { ...route, code: "R-9001", driverId: a.driver.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(b.db.route.create({ data: { ...route, code: "R-9002", driverId: b.driver.id, vehicleId: a.vehicle.id } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("nem o client GLOBAL consegue ligar registros de empresas diferentes", async () => {
    // Defesa em profundidade: mesmo código que erre e use o client sem filtro é barrado pelo banco.
    await expect(prisma.order.create({ data: orderData(b.companyId, a.customer.id) })).rejects.toMatchObject({ code: "P2003" });
    await expect(prisma.order.update({ where: { id: b.order.id }, data: { routeId: a.route.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.containerMovement.create({ data: { companyId: b.companyId, customerId: b.customer.id, containerProductId: a.container.id, delivered: 1 } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("B não registra arquivo com chave no prefixo da A", async () => {
    await expect(
      prisma.fileObject.create({
        data: { companyId: b.companyId, key: `companies/${a.companyId}/proofs/x/y.png`, kind: "PHOTO", mimeType: "image/png", sizeBytes: 1, uploadedById: b.driver.id },
      }),
    ).rejects.toThrow();
  });

  it("connect e set de relação são recusados antes de chegar ao banco", async () => {
    await expect(b.db.order.update({ where: { id: b.order.id }, data: { route: { connect: { id: a.route.id } } } })).rejects.toThrow(TenantIsolationError);
    await expect(b.db.route.update({ where: { id: b.route.id }, data: { orders: { connect: [{ id: a.order.id }] } } })).rejects.toThrow(TenantIsolationError);
    await expect(b.db.route.update({ where: { id: b.route.id }, data: { orders: { set: [{ id: a.order.id }] } } })).rejects.toThrow(TenantIsolationError);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } });
    expect(order.companyId).toBe(a.companyId);
    expect(order.routeId).toBe(a.route.id);
  });
});

describe("gravações da própria empresa", () => {
  it("create recebe o companyId da sessão mesmo sem informar", async () => {
    const vehicle = await b.db.vehicle.create({ data: { plate: "NEW1A11", model: "Novo" } as never });
    expect(vehicle.companyId).toBe(b.companyId);
  });

  it("create aninhado herda a empresa do registro pai", async () => {
    const template = await b.db.recurringOrderTemplate.create({
      data: {
        companyId: b.companyId,
        customerId: b.customer.id,
        dayOfWeek: "TER",
        startsOn: new Date("2026-01-06T00:00:00Z"),
        items: { create: [{ productId: b.product.id, quantity: "2.000" }] },
      },
      include: { items: true },
    });
    expect(template.items.map((item) => item.companyId)).toEqual([b.companyId]);
  });

  it("create com companyId de outra empresa é recusado", async () => {
    await expect(b.db.vehicle.create({ data: { companyId: a.companyId, plate: "BAD1A11", model: "x" } })).rejects.toThrow(TenantIsolationError);
    expect(await prisma.vehicle.count({ where: { plate: "BAD1A11" } })).toBe(0);
  });

  it("não é possível mover um registro para outra empresa", async () => {
    await expect(b.db.vehicle.update({ where: { id: b.vehicle.id }, data: { companyId: a.companyId } })).rejects.toThrow(TenantIsolationError);
    await expect(b.db.vehicle.updateMany({ data: { companyId: a.companyId } })).rejects.toThrow(TenantIsolationError);
  });

  it("o mesmo SKU, a mesma placa e o mesmo número de pedido podem existir em duas empresas", async () => {
    expect(a.product.sku).toBe(b.product.sku);
    expect(a.vehicle.plate).toBe(b.vehicle.plate);
    expect(a.order.orderNumber).toBe(b.order.orderNumber);
    expect(a.route.code).toBe(b.route.code);
  });
});

describe("transações", () => {
  it("o filtro por empresa continua valendo dentro de $transaction", async () => {
    await b.db.$transaction(async (tx) => {
      expect(await tx.order.findUnique({ where: { id: a.order.id } })).toBeNull();
      expect(await tx.order.count()).toBe(1);
      expect(await tx.customer.updateMany({ where: { id: a.customer.id }, data: { name: "invadido" } })).toEqual({ count: 0 });
      await expect(tx.$queryRaw`SELECT 1`).rejects.toThrow(TenantIsolationError);
    });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: a.customer.id } })).name).toBe("Cliente A");
  });
});

describe("empresa, sessão e SQL cru", () => {
  it("cada empresa só lê e altera o próprio cadastro", async () => {
    expect((await b.db.company.findUnique({ where: { id: a.companyId } }))?.id).toBe(b.companyId);
    expect((await b.db.company.findMany()).map((c) => c.id)).toEqual([b.companyId]);
    expect(await b.db.company.count()).toBe(1);

    await b.db.company.update({ where: { id: a.companyId }, data: { phone: "5516900000000" } });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: a.companyId } })).phone).toBeNull();
    expect((await prisma.company.findUniqueOrThrow({ where: { id: b.companyId } })).phone).toBe("5516900000000");
  });

  it("o client por empresa não cria nem apaga empresas", async () => {
    await expect(b.db.company.create({ data: { name: "x", trialEndsAt: new Date() } })).rejects.toThrow(TenantIsolationError);
    await expect(b.db.company.delete({ where: { id: b.companyId } })).rejects.toThrow(TenantIsolationError);
    await expect(b.db.company.deleteMany()).rejects.toThrow(TenantIsolationError);
  });

  it("sessões são inacessíveis pelo client por empresa", async () => {
    await expect(b.db.session.findMany()).rejects.toThrow(TenantIsolationError);
    await expect(b.db.session.deleteMany()).rejects.toThrow(TenantIsolationError);
    expect(await prisma.session.count()).toBe(2);
  });

  it("SQL cru é recusado", async () => {
    await expect(b.db.$queryRaw`SELECT * FROM "Order"`).rejects.toThrow(TenantIsolationError);
    await expect(b.db.$executeRaw`DELETE FROM "Order"`).rejects.toThrow(TenantIsolationError);
    await expect(b.db.$queryRawUnsafe('SELECT * FROM "Order"')).rejects.toThrow(TenantIsolationError);
    await expect(b.db.$executeRawUnsafe('DELETE FROM "Order"')).rejects.toThrow(TenantIsolationError);
    expect(await prisma.order.count()).toBe(2);
  });

  it("getTenantDb recusa sessão sem empresa", () => {
    expect(() => getTenantDb({ companyId: "" })).toThrow(TenantIsolationError);
    expect(() => getTenantDb({ companyId: undefined as unknown as string })).toThrow(TenantIsolationError);
  });
});

describe("campos sensíveis", () => {
  it("hash de senha e hash de token não saem em consultas comuns", async () => {
    const user = await b.db.user.findFirstOrThrow();
    expect(user).not.toHaveProperty("passwordHash");
    const session = await prisma.session.findFirstOrThrow();
    expect(session).not.toHaveProperty("tokenHash");
    const withHash = await prisma.user.findFirstOrThrow({ omit: { passwordHash: false } });
    expect(withHash.passwordHash).toBe("hash-de-teste");
  });
});
