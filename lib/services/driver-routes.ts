// Rotas na área do motorista (seção 5.7): lista do dia, pacote completo da rota (o que vai
// para o IndexedDB do celular) e "Iniciar rota".
//
// Decisões do dono do produto: rascunho não aparece; o ADMIN vê e opera qualquer rota do dia;
// com plano em atraso o motorista inicia rota já liberada e finaliza entregas normalmente.

import "server-only";

import { dbDateToDateString, dateStringToDbDate, todayInTimeZone } from "../../domain/dates";
import type { DeliveryLine, ProofPolicy } from "../../domain/delivery";
import { addressLine, coordinatesIfSameAddress } from "../../domain/maps";
import type { OrderStatus } from "../../domain/order-status";
import type { PaymentMethod } from "../../domain/payment";
import { decimalStringToMilli } from "../../domain/quantity";
import type { RouteStatus } from "../../domain/route-status";
import { type ServiceContext, assertCan } from "../auth/context";
import { seesOnlyOwnRoutes } from "../auth/permissions";
import { MESSAGES, ServiceError, notFound } from "../errors";
import { type TenantDb, getTenantDb } from "../tenant-db";
import { type ContainerBalanceLine, containerBalances } from "./container-balance";

export const DRIVER_MESSAGES = {
  draft: "A rota voltou para rascunho no escritório. Aguarde a nova liberação.",
  otherInProgress: (code: string) => `Termine a rota ${code} antes de iniciar outra.`,
  notStarted: "Toque em \"Iniciar rota\" antes de registrar entregas.",
  notInProgress: "A rota não está mais em andamento (foi reaberta ou fechada pelo escritório).",
  stopDone: "Esta parada já foi finalizada.",
} as const;

/** Filtro das rotas que o usuário enxerga na área do motorista. */
function visibleRoutesWhere(ctx: ServiceContext) {
  return { status: { not: "RASCUNHO" as const }, ...(seesOnlyOwnRoutes(ctx.role) ? { driverId: ctx.userId } : {}) };
}

export type DriverRouteDTO = {
  id: string;
  code: string;
  name: string;
  status: RouteStatus;
  stops: number;
  /** Paradas com desfecho registrado no servidor. */
  done: number;
  driverName: string;
  vehiclePlate: string | null;
};

export async function listDriverRoutesForToday(ctx: ServiceContext, now: Date = new Date()): Promise<{ date: string; routes: DriverRouteDTO[] }> {
  assertCan(ctx, "entregas.registrar");
  const date = todayInTimeZone(ctx.timezone, now);
  const routes = await getTenantDb(ctx).route.findMany({
    where: { deliveryDate: dateStringToDbDate(date), ...visibleRoutesWhere(ctx) },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      driver: { select: { name: true } },
      vehicle: { select: { plate: true } },
      orders: { select: { status: true } },
    },
    orderBy: { code: "asc" },
  });
  return {
    date,
    routes: routes.map((route) => ({
      id: route.id,
      code: route.code,
      name: route.name,
      status: route.status,
      stops: route.orders.length,
      done: route.orders.filter((order) => order.status !== "EM_ROTA" && order.status !== "PENDENTE").length,
      driverName: route.driver.name,
      vehiclePlate: route.vehicle?.plate ?? null,
    })),
  };
}

export type DriverStopDTO = {
  orderId: string;
  orderNumber: number;
  stopSequence: number;
  status: OrderStatus;
  invoiceNumber: string | null;
  customerName: string;
  phone: string | null;
  deliveryWindow: string | null;
  addressLine: string;
  complement: string | null;
  referencePoint: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  paymentMethod: PaymentMethod;
  totalCents: number;
  amountToCollectCents: number;
  lines: DeliveryLine[];
  /** Saldo de vasilhames do cliente antes desta rota. */
  containerBalance: ContainerBalanceLine[];
};

export type DriverRouteBundle = {
  route: { id: string; code: string; name: string; deliveryDate: string; status: RouteStatus; version: number; driverName: string; vehicle: { plate: string; model: string } | null };
  company: { name: string; proofPolicy: ProofPolicy };
  stops: DriverStopDTO[];
  /** Quando o servidor montou o pacote (ISO). */
  generatedAt: string;
};

async function loadVisibleRoute(db: TenantDb, ctx: ServiceContext, routeId: string) {
  const route = await db.route.findFirst({
    where: { id: routeId, ...visibleRoutesWhere(ctx) },
    select: { id: true, code: true, name: true, status: true, version: true, deliveryDate: true, driverId: true },
  });
  if (!route) {
    // Rota de outro motorista, inexistente ou de outra empresa: 404. Rascunho que o motorista
    // já tinha baixado: avisa que voltou para o escritório.
    const draft = await db.route.findFirst({ where: { id: routeId, status: "RASCUNHO", ...(seesOnlyOwnRoutes(ctx.role) ? { driverId: ctx.userId } : {}) }, select: { id: true } });
    if (draft) throw new ServiceError("VALIDACAO", DRIVER_MESSAGES.draft);
    throw notFound();
  }
  return route;
}

async function buildBundle(db: TenantDb, ctx: ServiceContext, routeId: string, now: Date): Promise<DriverRouteBundle> {
  const [route, company] = await Promise.all([
    db.route.findUniqueOrThrow({
      where: { id: routeId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        version: true,
        deliveryDate: true,
        proofPolicy: true,
        driver: { select: { name: true } },
        vehicle: { select: { plate: true, model: true } },
        orders: {
          select: {
            id: true,
            orderNumber: true,
            stopSequence: true,
            status: true,
            invoiceNumber: true,
            customerId: true,
            deliveryZipCode: true,
            deliveryStreet: true,
            deliveryNumber: true,
            deliveryComplement: true,
            deliveryNeighborhood: true,
            deliveryCity: true,
            deliveryState: true,
            deliveryReferencePoint: true,
            notes: true,
            paymentMethod: true,
            totalCents: true,
            amountToCollectCents: true,
            customer: { select: { name: true, phone: true, deliveryWindow: true, zipCode: true, street: true, number: true, city: true, latitude: true, longitude: true } },
            items: {
              select: {
                id: true,
                productId: true,
                productName: true,
                unit: true,
                quantity: true,
                unitPriceCents: true,
                product: { select: { unitsPerContainer: true, containerProduct: { select: { id: true, sku: true, name: true } } } },
              },
              orderBy: { id: "asc" },
            },
          },
          orderBy: [{ stopSequence: "asc" }, { orderNumber: "asc" }],
        },
      },
    }),
    db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true, proofPolicy: true } }),
  ]);
  const balances = await containerBalances(
    db,
    [...new Set(route.orders.map((order) => order.customerId))],
    route.orders.map((order) => order.id),
  );

  return {
    route: {
      id: route.id,
      code: route.code,
      name: route.name,
      deliveryDate: dbDateToDateString(route.deliveryDate),
      status: route.status,
      version: route.version,
      driverName: route.driver.name,
      vehicle: route.vehicle,
    },
    // Rota iniciada: a política guardada no início; antes disso, a atual da empresa.
    company: { name: company.name, proofPolicy: route.proofPolicy ?? company.proofPolicy },
    stops: route.orders.map((order, index) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      stopSequence: order.stopSequence ?? index + 1,
      status: order.status,
      invoiceNumber: order.invoiceNumber,
      customerName: order.customer.name,
      phone: order.customer.phone,
      deliveryWindow: order.customer.deliveryWindow,
      addressLine: addressLine({
        street: order.deliveryStreet,
        number: order.deliveryNumber,
        neighborhood: order.deliveryNeighborhood,
        city: order.deliveryCity,
        state: order.deliveryState,
        zipCode: order.deliveryZipCode,
      }),
      complement: order.deliveryComplement,
      referencePoint: order.deliveryReferencePoint,
      ...coordinatesIfSameAddress({ zipCode: order.deliveryZipCode, street: order.deliveryStreet, number: order.deliveryNumber, city: order.deliveryCity }, order.customer),
      notes: order.notes,
      paymentMethod: order.paymentMethod,
      totalCents: order.totalCents,
      amountToCollectCents: order.amountToCollectCents,
      lines: order.items.map((item) => {
        const container = item.product.containerProduct;
        return {
          orderItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          quantityMilli: decimalStringToMilli(item.quantity.toString()),
          unitPriceCents: item.unitPriceCents,
          container: container ? { productId: container.id, sku: container.sku, name: container.name, unitsPerContainer: item.product.unitsPerContainer } : null,
        };
      }),
      containerBalance: balances.get(order.customerId) ?? [],
    })),
    generatedAt: now.toISOString(),
  };
}

/** Pacote da rota para baixar de novo (sem mudar nada). */
export async function getDriverRouteBundle(ctx: ServiceContext, routeId: string, now: Date = new Date()): Promise<DriverRouteBundle> {
  assertCan(ctx, "entregas.registrar");
  const db = getTenantDb(ctx);
  await loadVisibleRoute(db, ctx, routeId);
  return buildBundle(db, ctx, routeId, now);
}

/**
 * "Iniciar rota": LIBERADA_CARGA -> EM_ANDAMENTO e devolve o pacote completo. Tocar de novo
 * numa rota já iniciada só baixa o pacote outra vez. Um motorista não tem duas rotas em
 * andamento ao mesmo tempo (seção 3.8).
 */
export async function startDriverRoute(ctx: ServiceContext, routeId: string, now: Date = new Date()): Promise<DriverRouteBundle> {
  assertCan(ctx, "entregas.registrar");
  const db = getTenantDb(ctx);
  const route = await loadVisibleRoute(db, ctx, routeId);
  if (route.status === "LIBERADA_CARGA") {
    await db.$transaction(async (tx) => {
      // Trava a linha do motorista: duas rotas dele iniciadas ao mesmo tempo passam uma de cada vez.
      await tx.user.updateMany({ where: { id: route.driverId }, data: { updatedAt: now } });
      const other = await tx.route.findFirst({ where: { driverId: route.driverId, status: "EM_ANDAMENTO", id: { not: route.id } }, select: { code: true } });
      if (other) throw new ServiceError("VALIDACAO", DRIVER_MESSAGES.otherInProgress(other.code));
      // A rota guarda a política de comprovante de agora: mudar a política da empresa depois
      // não recusa entregas desta rota (decisão do dono do produto).
      const { proofPolicy } = await tx.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { proofPolicy: true } });
      const started = await tx.route.updateMany({
        where: { id: route.id, status: "LIBERADA_CARGA", version: route.version },
        data: { status: "EM_ANDAMENTO", startedAt: now, proofPolicy, version: { increment: 1 } },
      });
      if (started.count === 0) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);
      await tx.auditLog.create({
        data: { companyId: ctx.companyId, userId: ctx.userId, entity: "Route", entityId: route.id, action: "ROTA_INICIADA", before: { status: route.status }, after: { status: "EM_ANDAMENTO" } },
      });
    });
  }
  return buildBundle(db, ctx, routeId, now);
}
