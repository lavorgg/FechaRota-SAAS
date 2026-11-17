// Pedidos (seção 5.5).
//
// - Preço, subtotal e total são SEMPRE recalculados aqui, com o preço do cadastro
//   (o navegador manda só produto e quantidade).
// - O pedido guarda cópia do endereço e dos produtos (seção 3.7).
// - Editar e cancelar conferem a versão (seção 3.10).
// - Reagendar cria pedido novo ligado ao original (decisão do dono do produto).

import "server-only";

import { dateStringToDbDate, dayOfWeekOfDateString, dbDateToDateString, formatDateString, todayInTimeZone } from "../../domain/dates";
import { type CatalogProduct, type PricedLine, priceOrderLines } from "../../domain/order-lines";
import { type OrderStatus, assertOrderTransition, isOrderEditable, isOrderReschedulable } from "../../domain/order-status";
import { type PaymentMethod, type PaymentStatus, calcAmountToCollectCents, initialPaymentStatus } from "../../domain/payment";
import { type ProductUnit, milliToDecimalString } from "../../domain/quantity";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { COUNTER_KEYS, nextCounterValue } from "../counters";
import { MESSAGES, ServiceError, notFound, prismaErrorCode } from "../errors";
import { decimalToMilli } from "../mappers/decimal";
import { type TenantDb, type TenantTx, getTenantDb } from "../tenant-db";
import type { CancelOrderData, CreateOrderData, ListOrdersData, RescheduleOrderData, UpdateOrderData } from "../validation/orders";
import { pageBounds, searchWhere } from "./common";

export const ORDERS_PAGE_SIZE = 50;

export const ORDER_MESSAGES = {
  inactiveCustomer: "Este cliente está inativo. Reative o cadastro para lançar pedidos.",
  notEditable: "Só pedido pendente pode ser editado.",
  recurringDate: "Este pedido veio de um pedido recorrente. Para entregar em outra data, cancele-o e lance um pedido avulso.",
  routedDate: "Tire o pedido da rota antes de mudar a data.",
  notReschedulable: "Só pedido não entregue pode ser reagendado.",
  alreadyRescheduled: "Este pedido já foi reagendado.",
  pastDate: "Escolha hoje ou uma data futura.",
  duplicate: (date: string, numbers: number[]) =>
    `Este cliente já tem ${numbers.length === 1 ? "o pedido" : "os pedidos"} nº ${numbers.join(", ")} para ${formatDateString(date)}. Lançar outro mesmo assim?`,
} as const;

// ---------------------------------------------------------------------------
// Apoio ao lançamento rápido
// ---------------------------------------------------------------------------

export type OrderCustomerOption = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  phone: string | null;
  defaultPaymentMethod: PaymentMethod;
  deliveryWindow: string | null;
};

/** Busca de cliente no lançamento rápido: nome, bairro ou telefone, sem acento (seção 5.5). */
export async function searchOrderCustomers(ctx: ServiceContext, query: string): Promise<OrderCustomerOption[]> {
  assertCan(ctx, "pedidos.gerenciar");
  return getTenantDb(ctx).customer.findMany({
    where: { active: true, ...searchWhere(query) },
    select: { id: true, name: true, neighborhood: true, city: true, phone: true, defaultPaymentMethod: true, deliveryWindow: true },
    orderBy: { name: "asc" },
    take: 10,
  });
}

export type OrderProductOption = { id: string; sku: string; name: string; unit: ProductUnit; priceCents: number; searchText: string };

/** Catálogo ativo para a busca de produto no navegador (resposta imediata ao digitar). */
export async function listOrderProducts(ctx: ServiceContext): Promise<OrderProductOption[]> {
  assertCan(ctx, "pedidos.gerenciar");
  return getTenantDb(ctx).product.findMany({
    where: { active: true },
    select: { id: true, sku: true, name: true, unit: true, priceCents: true, searchText: true },
    orderBy: [{ isReturnableContainer: "asc" }, { name: "asc" }],
  });
}

export type LastOrderDTO = {
  orderNumber: number;
  deliveryDate: string;
  items: Array<{ productId: string; productName: string; quantityMilli: number }>;
};

/** Último pedido do cliente (para "Repetir último pedido") e pedidos já lançados na data. */
export async function getCustomerOrderContext(
  ctx: ServiceContext,
  customerId: string,
  date: string,
): Promise<{ lastOrder: LastOrderDTO | null; ordersOnDate: number[] }> {
  assertCan(ctx, "pedidos.gerenciar");
  const db = getTenantDb(ctx);
  if (!(await db.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) throw notFound();

  const [last, sameDay] = await Promise.all([
    db.order.findFirst({
      where: { customerId, status: { not: "CANCELADO" } },
      orderBy: [{ deliveryDate: "desc" }, { createdAt: "desc" }],
      select: { orderNumber: true, deliveryDate: true, items: { select: { productId: true, productName: true, quantity: true }, orderBy: { createdAt: "asc" } } },
    }),
    db.order.findMany({ where: { customerId, deliveryDate: dateStringToDbDate(date), status: { not: "CANCELADO" } }, select: { orderNumber: true }, orderBy: { orderNumber: "asc" } }),
  ]);

  return {
    lastOrder: last
      ? {
          orderNumber: last.orderNumber,
          deliveryDate: dbDateToDateString(last.deliveryDate),
          items: last.items.map((item) => ({ productId: item.productId, productName: item.productName, quantityMilli: decimalToMilli(item.quantity) })),
        }
      : null,
    ordersOnDate: sameDay.map((order) => order.orderNumber),
  };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

async function loadCatalog(db: TenantDb | TenantTx, productIds: string[]): Promise<Map<string, CatalogProduct>> {
  const products = await db.product.findMany({
    where: { id: { in: [...new Set(productIds)] } },
    select: { id: true, name: true, unit: true, priceCents: true, active: true },
  });
  return new Map(products.map((product) => [product.id, product]));
}

function priceOrThrow(items: Array<{ productId: string; quantity: string }>, catalog: Map<string, CatalogProduct>) {
  const priced = priceOrderLines(items, catalog);
  if (!priced.ok) {
    const fieldErrors = Object.fromEntries(Object.entries(priced.lineErrors).map(([index, message]) => [`items.${index}`, message]));
    throw new ServiceError("VALIDACAO", priced.error, { items: priced.error, ...fieldErrors });
  }
  return priced;
}

type AddressSource = {
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  referencePoint: string | null;
  neighborhoodKey: string;
  cityKey: string;
};

const customerAddressSelect = {
  id: true,
  active: true,
  zipCode: true,
  street: true,
  number: true,
  complement: true,
  neighborhood: true,
  city: true,
  state: true,
  referencePoint: true,
  neighborhoodKey: true,
  cityKey: true,
} as const;

/** Cópia do endereço no pedido (seção 3.7). */
function addressSnapshot(customer: AddressSource) {
  return {
    deliveryZipCode: customer.zipCode,
    deliveryStreet: customer.street,
    deliveryNumber: customer.number,
    deliveryComplement: customer.complement,
    deliveryNeighborhood: customer.neighborhood,
    deliveryCity: customer.city,
    deliveryState: customer.state,
    deliveryReferencePoint: customer.referencePoint,
    deliveryNeighborhoodKey: customer.neighborhoodKey,
    deliveryCityKey: customer.cityKey,
  };
}

/** Itens do pedido. Sem companyId: no create aninhado ele vem do pedido (chave composta). */
function itemRecords(lines: PricedLine[]) {
  return lines.map((line) => ({
    productId: line.productId,
    productName: line.productName,
    unit: line.unit,
    quantity: milliToDecimalString(line.quantityMilli),
    unitPriceCents: line.unitPriceCents,
    subtotalCents: line.subtotalCents,
  }));
}

function moneyFields(paymentMethod: PaymentMethod, totalCents: number) {
  return {
    paymentMethod,
    totalCents,
    amountToCollectCents: calcAmountToCollectCents(paymentMethod, totalCents),
    paymentStatus: initialPaymentStatus(paymentMethod),
  };
}

async function assertNoDuplicate(db: TenantDb, params: { customerId: string; date: string; exceptId?: string; confirmed: boolean }): Promise<void> {
  if (params.confirmed) return;
  const existing = await db.order.findMany({
    where: {
      customerId: params.customerId,
      deliveryDate: dateStringToDbDate(params.date),
      status: { not: "CANCELADO" },
      ...(params.exceptId ? { id: { not: params.exceptId } } : {}),
    },
    select: { orderNumber: true },
    orderBy: { orderNumber: "asc" },
  });
  if (existing.length > 0) {
    throw new ServiceError("CONFIRMACAO", ORDER_MESSAGES.duplicate(params.date, existing.map((order) => order.orderNumber)));
  }
}

export type SavedOrder = { id: string; orderNumber: number; totalCents: number };

export async function createOrder(ctx: ServiceContext, data: CreateOrderData): Promise<SavedOrder> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);

  const customer = await db.customer.findUnique({ where: { id: data.customerId }, select: customerAddressSelect });
  if (!customer) throw notFound();
  if (!customer.active) throw new ServiceError("VALIDACAO", ORDER_MESSAGES.inactiveCustomer);

  const priced = priceOrThrow(data.items, await loadCatalog(db, data.items.map((item) => item.productId)));
  await assertNoDuplicate(db, { customerId: customer.id, date: data.deliveryDate, confirmed: data.confirmDuplicate });

  return db.$transaction(async (tx) => {
    let templateId: string | null = null;
    if (data.recurringDayOfWeek) {
      const template = await tx.recurringOrderTemplate.create({
        data: {
          companyId: ctx.companyId,
          customerId: customer.id,
          dayOfWeek: data.recurringDayOfWeek,
          startsOn: dateStringToDbDate(data.deliveryDate),
          // Sem preço fixo: o gerador usa o preço do produto no dia (seção 4).
          items: { create: priced.lines.map((line) => ({ productId: line.productId, quantity: milliToDecimalString(line.quantityMilli) })) },
        },
        select: { id: true },
      });
      // O pedido de hoje já conta como a ocorrência desta data: o gerador não duplica.
      if (dayOfWeekOfDateString(data.deliveryDate) === data.recurringDayOfWeek) templateId = template.id;
      await tx.auditLog.create({
        data: { companyId: ctx.companyId, userId: ctx.userId, entity: "RecurringOrderTemplate", entityId: template.id, action: "RECORRENTE_CRIADO", after: { dayOfWeek: data.recurringDayOfWeek } },
      });
    }

    const orderNumber = await nextCounterValue(tx, ctx.companyId, COUNTER_KEYS.order);
    const order = await tx.order.create({
      data: {
        companyId: ctx.companyId,
        orderNumber,
        customerId: customer.id,
        recurringTemplateId: templateId,
        deliveryDate: dateStringToDbDate(data.deliveryDate),
        status: "PENDENTE",
        ...addressSnapshot(customer),
        invoiceNumber: data.invoiceNumber,
        notes: data.notes,
        ...moneyFields(data.paymentMethod, priced.totalCents),
        items: { create: itemRecords(priced.lines) },
      },
      select: { id: true, orderNumber: true, totalCents: true },
    });
    return order;
  });
}

export async function updateOrder(ctx: ServiceContext, data: UpdateOrderData): Promise<SavedOrder> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);

  const current = await db.order.findUnique({
    where: { id: data.id },
    select: { id: true, status: true, version: true, customerId: true, routeId: true, recurringTemplateId: true, deliveryDate: true },
  });
  if (!current) throw notFound();
  if (!isOrderEditable(current.status)) throw new ServiceError("VALIDACAO", ORDER_MESSAGES.notEditable);
  if (current.version !== data.version) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);

  const dateChanged = dbDateToDateString(current.deliveryDate) !== data.deliveryDate;
  if (dateChanged && current.recurringTemplateId) throw new ServiceError("VALIDACAO", ORDER_MESSAGES.recurringDate, { deliveryDate: ORDER_MESSAGES.recurringDate });
  if (dateChanged && current.routeId) throw new ServiceError("VALIDACAO", ORDER_MESSAGES.routedDate, { deliveryDate: ORDER_MESSAGES.routedDate });

  const customer = await db.customer.findUnique({ where: { id: current.customerId }, select: customerAddressSelect });
  if (!customer) throw notFound();
  const priced = priceOrThrow(data.items, await loadCatalog(db, data.items.map((item) => item.productId)));
  if (dateChanged) await assertNoDuplicate(db, { customerId: customer.id, date: data.deliveryDate, exceptId: current.id, confirmed: data.confirmDuplicate });

  return db.$transaction(async (tx) => {
    // Só grava se ninguém mudou o pedido desde que a tela abriu (seção 3.10).
    const updated = await tx.order.updateMany({
      where: { id: current.id, version: data.version, status: "PENDENTE" },
      data: {
        deliveryDate: dateStringToDbDate(data.deliveryDate),
        // Pedido pendente ainda não foi carregado: a cópia do endereço acompanha o cadastro atual.
        ...addressSnapshot(customer),
        invoiceNumber: data.invoiceNumber,
        notes: data.notes,
        ...moneyFields(data.paymentMethod, priced.totalCents),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);

    await tx.orderItem.deleteMany({ where: { orderId: current.id } });
    await tx.orderItem.createMany({ data: itemRecords(priced.lines).map((item) => ({ ...item, companyId: ctx.companyId, orderId: current.id })) });
    const order = await tx.order.findUniqueOrThrow({ where: { id: current.id }, select: { id: true, orderNumber: true, totalCents: true } });
    return order;
  });
}

export async function cancelOrder(ctx: ServiceContext, data: CancelOrderData): Promise<void> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const current = await db.order.findUnique({ where: { id: data.id }, select: { id: true, status: true, version: true, routeId: true } });
  if (!current) throw notFound();
  try {
    assertOrderTransition(current.status, "CANCELADO");
  } catch (error) {
    throw new ServiceError("VALIDACAO", error instanceof Error ? error.message : ORDER_MESSAGES.notEditable);
  }
  if (current.version !== data.version) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);

  await db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: current.id, version: data.version, status: "PENDENTE" },
      // Pedido cancelado sai da rota em rascunho, se estiver em uma.
      data: { status: "CANCELADO", cancelReason: data.reason, routeId: null, stopSequence: null, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entity: "Order",
        entityId: current.id,
        action: "PEDIDO_CANCELADO",
        before: { status: current.status, routeId: current.routeId },
        after: { status: "CANCELADO" },
        reason: data.reason,
      },
    });
  });
}

/** Pedido não entregue -> pedido novo, PENDENTE, na nova data, ligado ao original. */
export async function rescheduleOrder(ctx: ServiceContext, data: RescheduleOrderData, now: Date = new Date()): Promise<SavedOrder> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (data.deliveryDate < todayInTimeZone(ctx.timezone, now)) {
    throw new ServiceError("VALIDACAO", ORDER_MESSAGES.pastDate, { deliveryDate: ORDER_MESSAGES.pastDate });
  }

  const original = await db.order.findUnique({
    where: { id: data.id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customerId: true,
      paymentMethod: true,
      totalCents: true,
      invoiceNumber: true,
      notes: true,
      rescheduledTo: { select: { id: true } },
      items: { select: { productId: true, productName: true, unit: true, quantity: true, unitPriceCents: true, subtotalCents: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!original) throw notFound();
  if (!isOrderReschedulable(original.status)) throw new ServiceError("VALIDACAO", ORDER_MESSAGES.notReschedulable);
  if (original.rescheduledTo) throw new ServiceError("CONFLITO", ORDER_MESSAGES.alreadyRescheduled);

  const customer = await db.customer.findUnique({ where: { id: original.customerId }, select: customerAddressSelect });
  if (!customer) throw notFound();
  if (!customer.active) throw new ServiceError("VALIDACAO", ORDER_MESSAGES.inactiveCustomer);

  try {
    return await db.$transaction(async (tx) => {
      const orderNumber = await nextCounterValue(tx, ctx.companyId, COUNTER_KEYS.order);
      const order = await tx.order.create({
        data: {
          companyId: ctx.companyId,
          orderNumber,
          customerId: customer.id,
          rescheduledFromOrderId: original.id,
          deliveryDate: dateStringToDbDate(data.deliveryDate),
          status: "PENDENTE",
          // Endereço do cadastro atual (pode ter sido corrigido depois da falha).
          ...addressSnapshot(customer),
          invoiceNumber: original.invoiceNumber,
          notes: original.notes,
          // Mesmos itens e preços combinados no pedido original.
          ...moneyFields(original.paymentMethod, original.totalCents),
          items: {
            create: original.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              unit: item.unit,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              subtotalCents: item.subtotalCents,
            })),
          },
        },
        select: { id: true, orderNumber: true, totalCents: true },
      });
      await tx.auditLog.create({
        data: {
          companyId: ctx.companyId,
          userId: ctx.userId,
          entity: "Order",
          entityId: original.id,
          action: "PEDIDO_REAGENDADO",
          after: { newOrderId: order.id, newOrderNumber: order.orderNumber, deliveryDate: data.deliveryDate },
        },
      });
      return order;
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") throw new ServiceError("CONFLITO", ORDER_MESSAGES.alreadyRescheduled);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export type OrderListItemDTO = {
  id: string;
  orderNumber: number;
  version: number;
  status: OrderStatus;
  customerName: string;
  neighborhood: string;
  city: string;
  itemCount: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  routeCode: string | null;
  recurring: boolean;
  rescheduledFromNumber: number | null;
  rescheduledToNumber: number | null;
  cancelReason: string | null;
  invoiceNumber: string | null;
};

export type OrderFilterOptions = {
  neighborhoods: Array<{ value: string; label: string }>;
  routes: Array<{ id: string; code: string; name: string }>;
};

/** Valor do filtro de bairro: cidade e bairro normalizados, juntos. */
export function neighborhoodFilterValue(cityKey: string, neighborhoodKey: string): string {
  return `${cityKey}|${neighborhoodKey}`;
}

export async function listOrders(
  ctx: ServiceContext,
  date: string,
  filters: ListOrdersData,
): Promise<{ items: OrderListItemDTO[]; total: number; page: number; pageCount: number; options: OrderFilterOptions }> {
  assertCan(ctx, "pedidos.gerenciar");
  const db = getTenantDb(ctx);
  const deliveryDate = dateStringToDbDate(date);
  const [cityKey, neighborhoodKey] = filters.bairro?.split("|") ?? [];

  const where = {
    deliveryDate,
    ...(filters.status ? { status: filters.status } : {}),
    ...(cityKey && neighborhoodKey ? { deliveryCityKey: cityKey, deliveryNeighborhoodKey: neighborhoodKey } : {}),
    ...(filters.cliente ? { customer: searchWhere(filters.cliente) } : {}),
    ...(filters.rota === "sem-rota" ? { routeId: null } : filters.rota ? { routeId: filters.rota } : {}),
  };

  const total = await db.order.count({ where });
  const { page, pageCount, skip } = pageBounds(total, filters.page, ORDERS_PAGE_SIZE);
  const [rows, neighborhoods, routes] = await Promise.all([
    db.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        version: true,
        status: true,
        deliveryNeighborhood: true,
        deliveryCity: true,
        totalCents: true,
        paymentMethod: true,
        paymentStatus: true,
        recurringTemplateId: true,
        cancelReason: true,
        invoiceNumber: true,
        customer: { select: { name: true } },
        route: { select: { code: true } },
        rescheduledFrom: { select: { orderNumber: true } },
        rescheduledTo: { select: { orderNumber: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ deliveryCityKey: "asc" }, { deliveryNeighborhoodKey: "asc" }, { orderNumber: "asc" }],
      skip,
      take: ORDERS_PAGE_SIZE,
    }),
    db.order.groupBy({
      by: ["deliveryCityKey", "deliveryNeighborhoodKey"],
      where: { deliveryDate },
      _min: { deliveryCity: true, deliveryNeighborhood: true },
      orderBy: [{ deliveryCityKey: "asc" }, { deliveryNeighborhoodKey: "asc" }],
    }),
    db.route.findMany({ where: { deliveryDate }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  return {
    total,
    page,
    pageCount,
    items: rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      version: row.version,
      status: row.status,
      customerName: row.customer.name,
      neighborhood: row.deliveryNeighborhood,
      city: row.deliveryCity,
      itemCount: row._count.items,
      totalCents: row.totalCents,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      routeCode: row.route?.code ?? null,
      recurring: row.recurringTemplateId !== null,
      rescheduledFromNumber: row.rescheduledFrom?.orderNumber ?? null,
      rescheduledToNumber: row.rescheduledTo?.orderNumber ?? null,
      cancelReason: row.cancelReason,
      invoiceNumber: row.invoiceNumber,
    })),
    options: {
      // Agrupado pela chave normalizada; mostra uma das grafias originais (seção 4).
      neighborhoods: neighborhoods.map((group) => ({
        value: neighborhoodFilterValue(group.deliveryCityKey, group.deliveryNeighborhoodKey),
        label: `${group._min.deliveryNeighborhood ?? group.deliveryNeighborhoodKey} · ${group._min.deliveryCity ?? group.deliveryCityKey}`,
      })),
      routes,
    },
  };
}

export type OrderForEditDTO = {
  id: string;
  orderNumber: number;
  version: number;
  status: OrderStatus;
  deliveryDate: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  invoiceNumber: string | null;
  recurring: boolean;
  customer: OrderCustomerOption;
  items: Array<{ productId: string; productName: string; quantityMilli: number }>;
};

export async function getOrderForEdit(ctx: ServiceContext, id: string): Promise<OrderForEditDTO> {
  assertCan(ctx, "pedidos.gerenciar");
  const order = await getTenantDb(ctx).order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      version: true,
      status: true,
      deliveryDate: true,
      paymentMethod: true,
      notes: true,
      invoiceNumber: true,
      recurringTemplateId: true,
      customer: { select: { id: true, name: true, neighborhood: true, city: true, phone: true, defaultPaymentMethod: true, deliveryWindow: true } },
      items: { select: { productId: true, productName: true, quantity: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) throw notFound();
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    version: order.version,
    status: order.status,
    deliveryDate: dbDateToDateString(order.deliveryDate),
    paymentMethod: order.paymentMethod,
    notes: order.notes,
    invoiceNumber: order.invoiceNumber,
    recurring: order.recurringTemplateId !== null,
    customer: order.customer,
    items: order.items.map((item) => ({ productId: item.productId, productName: item.productName, quantityMilli: decimalToMilli(item.quantity) })),
  };
}
