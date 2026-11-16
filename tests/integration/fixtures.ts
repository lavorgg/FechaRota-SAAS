// Dados mínimos para os testes de integração: uma empresa com pelo menos um registro em
// CADA tabela de negócio.

import { randomUUID } from "node:crypto";

import { dateStringToDbDate } from "@/domain/dates";
import { COUNTER_KEYS } from "@/lib/counters";
import { prisma } from "@/lib/db";
import { getTenantDb } from "@/lib/tenant-db";
import { COMPANY_MODEL, FORBIDDEN_MODELS, TENANT_MODELS } from "@/lib/tenant-scope";

/** Apaga todas as linhas de todas as tabelas do banco de teste. */
export async function cleanDatabase(): Promise<void> {
  const tables = [...TENANT_MODELS, COMPANY_MODEL, ...FORBIDDEN_MODELS].map((name) => `"${name}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

export type CompanyFixture = Awaited<ReturnType<typeof createCompanyFixture>>;

export async function createCompanyFixture(label: string) {
  const company = await prisma.company.create({
    data: { name: `Empresa ${label}`, trialEndsAt: new Date("2030-01-01T00:00:00Z") },
  });
  const companyId = company.id;
  const db = getTenantDb({ companyId });

  const admin = await db.user.create({
    data: { companyId, name: `Admin ${label}`, email: `admin-${label}-${randomUUID()}@teste.local`, passwordHash: "hash-de-teste", role: "ADMIN" },
  });
  const driver = await db.user.create({
    data: { companyId, name: `Motorista ${label}`, email: `motorista-${label}-${randomUUID()}@teste.local`, passwordHash: "hash-de-teste", role: "MOTORISTA" },
  });
  const session = await prisma.session.create({
    data: { userId: admin.id, tokenHash: `token-${randomUUID()}`, expiresAt: new Date("2030-01-01T00:00:00Z") },
  });
  const counter = await db.companyCounter.create({ data: { companyId, key: COUNTER_KEYS.order, value: 1 } });
  const vehicle = await db.vehicle.create({ data: { companyId, plate: "ABC1D23", model: "Furgão" } });
  const customer = await db.customer.create({
    data: {
      companyId,
      name: `Cliente ${label}`,
      zipCode: "14010000",
      street: "Rua Um",
      number: "10",
      neighborhood: "Centro",
      city: "Ribeirão Preto",
      state: "SP",
      neighborhoodKey: "centro",
      cityKey: "ribeirao preto",
      defaultPaymentMethod: "DINHEIRO",
    },
  });
  const container = await db.product.create({
    data: { companyId, sku: "CAIXA", name: "Caixa retornável", unit: "UN", priceCents: 2500, isReturnableContainer: true },
  });
  const product = await db.product.create({
    data: { companyId, sku: "LEITE-1L", name: "Leite 1L", unit: "UN", priceCents: 549, weightKg: "1.050", containerProductId: container.id, unitsPerContainer: 12 },
  });
  const template = await db.recurringOrderTemplate.create({
    data: {
      companyId,
      customerId: customer.id,
      dayOfWeek: "SEG",
      startsOn: dateStringToDbDate("2026-01-05"),
      items: { create: [{ productId: product.id, quantity: "12.000" }] },
    },
    include: { items: true },
  });
  const route = await db.route.create({
    data: { companyId, code: "R-0001", name: `Rota ${label}`, deliveryDate: dateStringToDbDate("2026-11-16"), driverId: driver.id, vehicleId: vehicle.id },
  });
  const order = await db.order.create({
    data: {
      companyId,
      orderNumber: 1,
      customerId: customer.id,
      recurringTemplateId: template.id,
      routeId: route.id,
      stopSequence: 1,
      deliveryDate: dateStringToDbDate("2026-11-16"),
      deliveryZipCode: customer.zipCode,
      deliveryStreet: customer.street,
      deliveryNumber: customer.number,
      deliveryNeighborhood: customer.neighborhood,
      deliveryCity: customer.city,
      deliveryState: "SP",
      deliveryNeighborhoodKey: customer.neighborhoodKey,
      deliveryCityKey: customer.cityKey,
      paymentMethod: "DINHEIRO",
      totalCents: 6588,
      amountToCollectCents: 6588,
      paymentStatus: "A_RECEBER",
      items: { create: [{ productId: product.id, productName: product.name, unit: "UN", quantity: "12.000", unitPriceCents: 549, subtotalCents: 6588 }] },
    },
    include: { items: true },
  });
  const fileKey = `companies/${companyId}/proofs/${order.id}/${randomUUID()}.png`;
  const file = await db.fileObject.create({
    data: { companyId, key: fileKey, kind: "SIGNATURE", mimeType: "image/png", sizeBytes: 1234, uploadedById: driver.id },
  });
  const proof = await db.deliveryProof.create({
    data: { companyId, orderId: order.id, clientRequestId: randomUUID(), outcome: "ENTREGUE", deliveredAt: new Date(), signatureFileKey: fileKey, photoFileKeys: [], cashCollectedCents: 6588, recordedById: driver.id },
  });
  const movement = await db.containerMovement.create({
    data: { companyId, customerId: customer.id, containerProductId: container.id, orderId: order.id, routeId: route.id, delivered: 1, returned: 0 },
  });
  const audit = await db.auditLog.create({
    data: { companyId, userId: admin.id, entity: "Order", entityId: order.id, action: "TESTE", after: { ok: true } },
  });

  const templateItem = template.items[0];
  const orderItem = order.items[0];
  if (!templateItem || !orderItem) throw new Error("Fixture incompleta.");

  return { company, companyId, db, admin, driver, session, counter, vehicle, customer, container, product, template, templateItem, route, order, orderItem, file, proof, movement, audit };
}
