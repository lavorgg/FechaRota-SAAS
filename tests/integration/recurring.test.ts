// Gerador de pedidos recorrentes (seções 3.9 e 5.5) e templates.

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, dateStringToDbDate, dayOfWeekOfDateString, todayInTimeZone } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { generateRecurringOrders } from "@/lib/services/recurring-generator";
import { createTemplate, listCustomerTemplates, pauseTemplate, setTemplateActive, updateTemplate } from "@/lib/services/templates";
import { createTemplateSchema, updateTemplateSchema } from "@/lib/validation/orders";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;
const date = addDays(todayInTimeZone("America/Sao_Paulo"), 14);
const day = dayOfWeekOfDateString(date);

async function customer(fixture: CompanyFixture, name: string, active = true) {
  return prisma.customer.create({
    data: {
      companyId: fixture.companyId,
      name,
      zipCode: "14010000",
      street: "Rua Dois",
      number: "20",
      neighborhood: "Jardim",
      city: "Ribeirão Preto",
      state: "SP",
      neighborhoodKey: "jardim",
      cityKey: "ribeirao preto",
      defaultPaymentMethod: "PIX",
      active,
    },
  });
}

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
});

describe("templates", () => {
  it("cria, edita itens, pausa, retoma e desativa", async () => {
    const ctx = contextOf(a.admin);
    const c = await customer(a, "Template Ltda");
    const template = await createTemplate(ctx, createTemplateSchema.parse({ customerId: c.id, dayOfWeek: "QUA", startsOn: "2026-01-01", items: [{ productId: a.product.id, quantity: "12", unitPrice: "5,00" }] }));
    expect(template.items[0]).toMatchObject({ quantityMilli: 12000, unitPriceCents: 500, currentPriceCents: 549 });

    const updated = await updateTemplate(ctx, updateTemplateSchema.parse({ id: template.id, dayOfWeek: "QUI", startsOn: "2026-01-01", items: [{ productId: a.product.id, quantity: "24", unitPrice: "" }] }));
    expect(updated).toMatchObject({ dayOfWeek: "QUI" });
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]).toMatchObject({ quantityMilli: 24000, unitPriceCents: null });

    expect((await pauseTemplate(ctx, { id: template.id, pausedUntil: "2026-12-31" })).pausedUntil).toBe("2026-12-31");
    expect((await pauseTemplate(ctx, { id: template.id, pausedUntil: null })).pausedUntil).toBeNull();
    expect((await setTemplateActive(ctx, template.id, false)).active).toBe(false);
    expect((await listCustomerTemplates(ctx, c.id)).map((t) => t.id)).toEqual([template.id]);
  });

  it("outra empresa não vê nem altera; motorista não acessa", async () => {
    await expect(pauseTemplate(contextOf(b.admin), { id: a.template.id, pausedUntil: null })).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
    expect(await listCustomerTemplates(contextOf(b.admin), a.customer.id)).toEqual([]);
    await expect(listCustomerTemplates(contextOf(a.driver), a.customer.id)).rejects.toMatchObject({ code: "SEM_PERMISSAO" });
  });
});

describe("gerador de recorrentes", () => {
  it("cria os pedidos devidos, conta os que já existiam, lista os ignorados e não duplica ao rodar de novo", async () => {
    const ctx = contextOf(a.admin);
    const active = await customer(a, "Ativo Recorrente");
    const inactive = await customer(a, "Inativo Recorrente", false);
    const withInactiveProduct = await customer(a, "Produto Inativo Recorrente");
    const paused = await customer(a, "Pausado Recorrente");
    const oldProduct = await prisma.product.create({ data: { companyId: a.companyId, sku: "VELHO", name: "Produto velho", unit: "UN", priceCents: 100, active: false } });

    const make = (customerId: string, productId: string, extra: Record<string, unknown> = {}) =>
      prisma.recurringOrderTemplate.create({
        data: { companyId: a.companyId, customerId, dayOfWeek: day, startsOn: dateStringToDbDate("2026-01-01"), items: { create: [{ productId, quantity: "10.000", unitPriceCents: 500 }] }, ...extra },
      });
    await make(active.id, a.product.id);
    await make(inactive.id, a.product.id);
    await make(withInactiveProduct.id, oldProduct.id);
    await make(paused.id, a.product.id, { pausedUntil: dateStringToDbDate(date) });

    const first = await generateRecurringOrders(ctx, date);
    expect(first.created.map((c) => c.customerName)).toEqual(["Ativo Recorrente"]);
    expect(first.alreadyExisted).toBe(0);
    expect(first.ignored).toEqual([
      { customerName: "Inativo Recorrente", reason: "Cliente inativo." },
      { customerName: "Produto Inativo Recorrente", reason: "Produto inativo: Produto velho (VELHO)." },
    ]);

    const order = await prisma.order.findFirstOrThrow({ where: { customerId: active.id }, include: { items: true } });
    expect(order).toMatchObject({ status: "PENDENTE", paymentMethod: "PIX", totalCents: 5000, amountToCollectCents: 5000, deliveryNeighborhoodKey: "jardim" });
    expect(order.items[0]).toMatchObject({ unitPriceCents: 500, subtotalCents: 5000 });

    const second = await generateRecurringOrders(ctx, date);
    expect(second.created).toEqual([]);
    expect(second.alreadyExisted).toBe(1);
    expect(second.ignored).toHaveLength(2);
    expect(await prisma.order.count({ where: { customerId: active.id } })).toBe(1);
  });

  it("dois geradores ao mesmo tempo também não duplicam", async () => {
    const ctx = contextOf(b.admin);
    const c = await customer(b, "Concorrente");
    await prisma.recurringOrderTemplate.create({
      data: { companyId: b.companyId, customerId: c.id, dayOfWeek: day, startsOn: dateStringToDbDate("2026-01-01"), items: { create: [{ productId: b.product.id, quantity: "1.000" }] } },
    });
    const results = await Promise.all([generateRecurringOrders(ctx, date), generateRecurringOrders(ctx, date)]);
    expect(results.map((r) => r.created.length).sort()).toEqual([0, 1]);
    expect(results.map((r) => r.alreadyExisted).sort()).toEqual([0, 1]);
    expect(await prisma.order.count({ where: { customerId: c.id } })).toBe(1);
  });

  it("pedido de recorrente cancelado conta como já existente (não regenera)", async () => {
    const ctx = contextOf(a.admin);
    const generated = await prisma.order.findFirstOrThrow({ where: { companyId: a.companyId, deliveryDate: dateStringToDbDate(date), recurringTemplateId: { not: null } } });
    await prisma.order.update({ where: { id: generated.id }, data: { status: "CANCELADO", cancelReason: "teste" } });
    const result = await generateRecurringOrders(ctx, date);
    expect(result.created).toEqual([]);
    expect(result.alreadyExisted).toBe(1);
  });

  it("outra empresa e motorista: nada é gerado com os templates da A", async () => {
    await expect(generateRecurringOrders(contextOf(a.driver), date)).rejects.toMatchObject({ code: "SEM_PERMISSAO" });
    const before = await prisma.order.count({ where: { companyId: a.companyId } });
    await generateRecurringOrders(contextOf(b.admin), date);
    expect(await prisma.order.count({ where: { companyId: a.companyId } })).toBe(before);
  });
});
