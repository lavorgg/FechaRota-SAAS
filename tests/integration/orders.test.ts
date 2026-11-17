// Pedidos (seção 5.5): preço calculado no servidor, cópia do endereço, versão, cancelamento,
// reagendamento (pedido novo) e listagem.

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, todayInTimeZone } from "@/domain/dates";
import { prisma } from "@/lib/db";
import { MESSAGES, ServiceError } from "@/lib/errors";
import {
  ORDER_MESSAGES,
  cancelOrder,
  createOrder,
  getCustomerOrderContext,
  getOrderForEdit,
  listOrders,
  rescheduleOrder,
  searchOrderCustomers,
  updateOrder,
} from "@/lib/services/orders";
import { createOrderSchema, listOrdersSchema, updateOrderSchema } from "@/lib/validation/orders";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;
const today = todayInTimeZone("America/Sao_Paulo");
const tomorrow = addDays(today, 1);

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
});

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

function input(overrides: Record<string, unknown> = {}) {
  return createOrderSchema.parse({
    customerId: a.customer.id,
    deliveryDate: tomorrow,
    paymentMethod: "DINHEIRO",
    items: [{ productId: a.product.id, quantity: "24" }],
    ...overrides,
  });
}

describe("lançar pedido", () => {
  it("o servidor calcula preço, subtotal, total e valor a cobrar; guarda cópia do endereço", async () => {
    const saved = await createOrder(contextOf(a.admin), input({ notes: "Entregar cedo", invoiceNumber: "123" }));
    const order = await prisma.order.findUniqueOrThrow({ where: { id: saved.id }, include: { items: true } });
    expect(order).toMatchObject({
      status: "PENDENTE",
      version: 1,
      totalCents: 24 * 549,
      amountToCollectCents: 24 * 549,
      paymentStatus: "A_RECEBER",
      deliveryStreet: "Rua Um",
      deliveryNeighborhoodKey: "centro",
      notes: "Entregar cedo",
      invoiceNumber: "123",
    });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ productName: "Leite 1L", unit: "UN", unitPriceCents: 549, subtotalCents: 13176 });
    expect(saved.orderNumber).toBe(2);
  });

  it("boleto e faturado: nada a cobrar na entrega", async () => {
    const saved = await createOrder(contextOf(a.admin), input({ paymentMethod: "FATURADO", confirmDuplicate: true }));
    expect(await prisma.order.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ amountToCollectCents: 0, paymentStatus: "FATURADO" });
  });

  it("pede confirmação para segundo pedido do cliente na mesma data", async () => {
    const error = await rejection(createOrder(contextOf(a.admin), input()));
    expect(error.code).toBe("CONFIRMACAO");
    expect(error.message).toMatch(/já tem os pedidos nº 2, 3 para/);
    await expect(createOrder(contextOf(a.admin), input({ confirmDuplicate: true }))).resolves.toBeTruthy();
  });

  it("valida a quantidade pela unidade e recusa produto inativo ou de outra empresa", async () => {
    const fraction = await rejection(createOrder(contextOf(a.admin), input({ items: [{ productId: a.product.id, quantity: "1,5" }], confirmDuplicate: true })));
    expect(fraction.fieldErrors?.["items.0"]).toBe("Quantidade em UN deve ser um número inteiro.");
    const foreign = await rejection(createOrder(contextOf(a.admin), input({ items: [{ productId: b.product.id, quantity: "1" }], confirmDuplicate: true })));
    expect(foreign.fieldErrors?.["items.0"]).toBe("Produto não encontrado.");
    expect((await rejection(createOrder(contextOf(b.admin), input()))).code).toBe("NAO_ENCONTRADO");
  });

  it("cliente inativo não recebe pedido", async () => {
    const inactive = await prisma.customer.update({ where: { id: a.customer.id }, data: { active: false } });
    try {
      expect((await rejection(createOrder(contextOf(a.admin), input({ confirmDuplicate: true })))).message).toBe(ORDER_MESSAGES.inactiveCustomer);
    } finally {
      await prisma.customer.update({ where: { id: inactive.id }, data: { active: true } });
    }
  });

  it("\"salvar também como recorrente\" cria o template e liga o pedido quando o dia bate", async () => {
    const day = (await import("@/domain/dates")).dayOfWeekOfDateString(tomorrow);
    const saved = await createOrder(contextOf(a.admin), input({ recurringDayOfWeek: day, confirmDuplicate: true }));
    const order = await prisma.order.findUniqueOrThrow({ where: { id: saved.id }, include: { recurringTemplate: { include: { items: true } } } });
    expect(order.recurringTemplate).toMatchObject({ dayOfWeek: day, active: true });
    expect(order.recurringTemplate?.items[0]).toMatchObject({ unitPriceCents: null });
    expect(order.recurringTemplate?.items[0]?.quantity.toFixed(3)).toBe("24.000");
  });

  it("EXPEDICAO lança; MOTORISTA não", async () => {
    expect((await rejection(createOrder(contextOf(a.driver), input()))).code).toBe("SEM_PERMISSAO");
  });
});

describe("lançamento rápido", () => {
  it("busca cliente ativo por nome, bairro ou telefone, sem acento", async () => {
    expect((await searchOrderCustomers(contextOf(a.admin), "CENTRO")).map((c) => c.id)).toEqual([a.customer.id]);
    // A empresa B só encontra os próprios clientes.
    const fromB = (await searchOrderCustomers(contextOf(b.admin), "centro")).map((c) => c.id);
    expect(fromB).toEqual([b.customer.id]);
  });

  it("último pedido do cliente e pedidos já lançados na data", async () => {
    const context = await getCustomerOrderContext(contextOf(a.admin), a.customer.id, tomorrow);
    expect(context.ordersOnDate.length).toBeGreaterThanOrEqual(3);
    expect(context.lastOrder?.items[0]).toMatchObject({ productId: a.product.id, quantityMilli: 24000 });
  });
});

describe("editar pedido", () => {
  it("troca itens, recalcula e incrementa a versão; versão velha é recusada", async () => {
    const saved = await createOrder(contextOf(a.admin), input({ deliveryDate: addDays(today, 3) }));
    const edit = updateOrderSchema.parse({ id: saved.id, version: 1, deliveryDate: addDays(today, 3), paymentMethod: "PIX", items: [{ productId: a.product.id, quantity: "2" }] });
    expect(await updateOrder(contextOf(a.admin), edit)).toMatchObject({ totalCents: 1098 });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: saved.id }, include: { items: true } });
    expect(order).toMatchObject({ version: 2, paymentMethod: "PIX", amountToCollectCents: 1098 });
    expect(order.items).toHaveLength(1);

    const stale = await rejection(updateOrder(contextOf(a.admin), edit));
    expect(stale.message).toBe(MESSAGES.staleVersion);
  });

  it("duas edições simultâneas com a mesma versão: só uma grava", async () => {
    const saved = await createOrder(contextOf(a.admin), input({ deliveryDate: addDays(today, 4) }));
    const edit = (quantity: string) => updateOrderSchema.parse({ id: saved.id, version: 1, deliveryDate: addDays(today, 4), paymentMethod: "DINHEIRO", items: [{ productId: a.product.id, quantity }] });
    const results = await Promise.allSettled([updateOrder(contextOf(a.admin), edit("5")), updateOrder(contextOf(a.admin), edit("7"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: saved.id } })).version).toBe(2);
  });

  it("pedido vindo de recorrente não muda de data; pedido não pendente não é editado", async () => {
    const recurring = await getOrderForEdit(contextOf(a.admin), a.order.id);
    expect(recurring.recurring).toBe(true);
    const error = await rejection(
      updateOrder(contextOf(a.admin), updateOrderSchema.parse({ id: a.order.id, version: recurring.version, deliveryDate: addDays(today, 10), paymentMethod: "DINHEIRO", items: [{ productId: a.product.id, quantity: "1" }] })),
    );
    expect(error.message).toBe(ORDER_MESSAGES.recurringDate);
    expect((await rejection(updateOrder(contextOf(b.admin), updateOrderSchema.parse({ id: a.order.id, version: 1, deliveryDate: today, paymentMethod: "PIX", items: [{ productId: b.product.id, quantity: "1" }] })))).code).toBe("NAO_ENCONTRADO");
  });
});

describe("cancelar pedido", () => {
  it("exige motivo, grava auditoria e tira da rota", async () => {
    const saved = await createOrder(contextOf(a.admin), input({ deliveryDate: addDays(today, 5) }));
    await cancelOrder(contextOf(a.admin), { id: saved.id, version: 1, reason: "Cliente desistiu" });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: saved.id } });
    expect(order).toMatchObject({ status: "CANCELADO", cancelReason: "Cliente desistiu", routeId: null, version: 2 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: saved.id, action: "PEDIDO_CANCELADO" } });
    expect(audit).toMatchObject({ reason: "Cliente desistiu", userId: a.admin.id });

    const again = await rejection(cancelOrder(contextOf(a.admin), { id: saved.id, version: 2, reason: "de novo" }));
    expect(again.message).toBe("Não é possível mudar o pedido de Cancelado para Cancelado.");
  });
});

describe("reagendar pedido não entregue", () => {
  async function failedOrder(): Promise<string> {
    const saved = await createOrder(contextOf(a.admin), input({ deliveryDate: addDays(today, 6), invoiceNumber: "NF-9", confirmDuplicate: true }));
    await prisma.order.update({ where: { id: saved.id }, data: { status: "NAO_ENTREGUE", paymentStatus: "NAO_RECEBIDO" } });
    return saved.id;
  }

  it("cria pedido novo PENDENTE na data, com os mesmos itens e preços; o original fica como está", async () => {
    const originalId = await failedOrder();
    await prisma.product.update({ where: { id: a.product.id }, data: { priceCents: 999 } });
    try {
      const saved = await rescheduleOrder(contextOf(a.admin), { id: originalId, deliveryDate: addDays(today, 7) });
      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: saved.id }, include: { items: true } });
      expect(fresh).toMatchObject({ status: "PENDENTE", rescheduledFromOrderId: originalId, invoiceNumber: "NF-9", recurringTemplateId: null, amountToCollectCents: 24 * 549 });
      expect(fresh.items[0]).toMatchObject({ unitPriceCents: 549 });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: originalId } })).toMatchObject({ status: "NAO_ENTREGUE" });
      expect(await prisma.auditLog.count({ where: { entityId: originalId, action: "PEDIDO_REAGENDADO" } })).toBe(1);
    } finally {
      await prisma.product.update({ where: { id: a.product.id }, data: { priceCents: 549 } });
    }
  });

  it("só uma vez, mesmo com dois cliques ao mesmo tempo", async () => {
    const originalId = await failedOrder();
    const results = await Promise.allSettled([
      rescheduleOrder(contextOf(a.admin), { id: originalId, deliveryDate: addDays(today, 8) }),
      rescheduleOrder(contextOf(a.admin), { id: originalId, deliveryDate: addDays(today, 8) }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.order.count({ where: { rescheduledFromOrderId: originalId } })).toBe(1);
    expect((await rejection(rescheduleOrder(contextOf(a.admin), { id: originalId, deliveryDate: addDays(today, 9) }))).message).toBe(ORDER_MESSAGES.alreadyRescheduled);
  });

  it("recusa data passada e pedido que não é NAO_ENTREGUE", async () => {
    const originalId = await failedOrder();
    expect((await rejection(rescheduleOrder(contextOf(a.admin), { id: originalId, deliveryDate: addDays(today, -1) }))).message).toBe(ORDER_MESSAGES.pastDate);
    expect((await rejection(rescheduleOrder(contextOf(a.admin), { id: a.order.id, deliveryDate: tomorrow }))).message).toBe(ORDER_MESSAGES.notReschedulable);
  });
});

describe("listagem", () => {
  it("filtra por situação, bairro (chave normalizada), cliente e rota", async () => {
    const ctx = contextOf(a.admin);
    const all = await listOrders(ctx, tomorrow, listOrdersSchema.parse({}));
    expect(all.total).toBeGreaterThanOrEqual(4);
    expect(all.options.neighborhoods).toEqual([{ value: "ribeirao preto|centro", label: "Centro · Ribeirão Preto" }]);

    const byNeighborhood = await listOrders(ctx, tomorrow, listOrdersSchema.parse({ bairro: "ribeirao preto|centro" }));
    expect(byNeighborhood.total).toBe(all.total);
    expect((await listOrders(ctx, tomorrow, listOrdersSchema.parse({ bairro: "x|y" }))).total).toBe(0);
    expect((await listOrders(ctx, tomorrow, listOrdersSchema.parse({ cliente: "CLIENTE a" }))).total).toBe(all.total);
    expect((await listOrders(ctx, tomorrow, listOrdersSchema.parse({ cliente: "inexistente" }))).total).toBe(0);
    expect((await listOrders(ctx, tomorrow, listOrdersSchema.parse({ rota: "sem-rota" }))).total).toBe(all.total);
    expect((await listOrders(ctx, tomorrow, listOrdersSchema.parse({ status: "CANCELADO" }))).total).toBe(0);
  });

  it("a outra empresa não vê os pedidos", async () => {
    expect((await listOrders(contextOf(b.admin), tomorrow, listOrdersSchema.parse({}))).total).toBe(0);
  });
});
