// Montagem de rotas (seção 5.6): agrupador, construtor, ordem das paradas, liberação para
// carga, reabertura (só ADMIN) e exclusão de rascunho.
//
// Concorrência (seção 3.10): toda alteração confere `version` da rota e incrementa. Pedido que
// entra ou sai de rota também tem a `version` incrementada, para que uma edição do pedido
// aberta em outra aba perceba a mudança. Reordenar não mexe na versão do pedido: a ordem é
// dado da rota.

import "server-only";

import { dateStringToDbDate, dbDateToDateString } from "../../domain/dates";
import { type MapsSegment, addressLine, buildMapsSegments, coordinatesIfSameAddress } from "../../domain/maps";
import type { PaymentMethod } from "../../domain/payment";
import { decimalStringToMilli } from "../../domain/quantity";
import { type CityGroup, type LoadSummary, type PlanningOrder, groupByCityAndNeighborhood, suggestStopOrder, summarizeLoad } from "../../domain/route-planning";
import { type RouteStatus, assertRouteTransition, isRouteCompositionEditable } from "../../domain/route-status";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { COUNTER_KEYS, formatRouteCode, nextCounterValue } from "../counters";
import { MESSAGES, ServiceError, notFound } from "../errors";
import { type TenantDb, type TenantTx, getTenantDb } from "../tenant-db";
import type { CreateRouteData, RemoveRouteOrderData, ReopenRouteData, RouteOrdersData, RouteVersionData, UpdateRouteData } from "../validation/routes";

export const ROUTE_MESSAGES = {
  frozen: "Rota liberada para carga: a composição está congelada. Para alterar, um administrador precisa reabrir a rota.",
  notReopenable: "Só dá para reabrir uma rota liberada para carga, antes de o motorista iniciar.",
  notDeletable: "Só dá para excluir uma rota em rascunho.",
  empty: "Adicione pelo menos um pedido antes de liberar a rota.",
  ordersChanged: "Algum pedido selecionado já entrou em outra rota, foi cancelado ou mudou. Atualize a página e tente de novo.",
  orderNotInRoute: "Este pedido não está nesta rota. Atualize a página.",
  stopsChanged: "A lista de paradas mudou. Atualize a página e tente de novo.",
  driver: "Escolha um motorista ativo.",
  vehicle: "Escolha um veículo ativo.",
  inactiveDriver: "O motorista desta rota está inativo. Escolha outro motorista antes de liberar.",
  inactiveVehicle: "O veículo desta rota está inativo. Escolha outro veículo antes de liberar.",
} as const;

// Uma rota pode ter até 200 paradas; cada parada é uma instrução na transação.
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type RouteDriverOption = { id: string; name: string };
export type RouteVehicleOption = { id: string; plate: string; model: string; capacityKg: number | null };

export type RouteListItemDTO = LoadSummary & {
  id: string;
  code: string;
  name: string;
  status: RouteStatus;
  driverName: string;
  vehiclePlate: string | null;
  capacityKg: number | null;
};

export type RoutePlanningDTO = {
  date: string;
  groups: CityGroup[];
  routes: RouteListItemDTO[];
  drivers: RouteDriverOption[];
  vehicles: RouteVehicleOption[];
};

/** Peso por unidade em gramas: Decimal(10,3) em kg -> inteiro (1,050 kg = 1050 g). */
function weightGramsOf(weightKg: { toString(): string } | null): number | null {
  return weightKg === null ? null : decimalStringToMilli(weightKg.toString());
}

const planningOrderSelect = {
  id: true,
  orderNumber: true,
  totalCents: true,
  deliveryStreet: true,
  deliveryNumber: true,
  deliveryNeighborhood: true,
  deliveryNeighborhoodKey: true,
  deliveryCity: true,
  deliveryCityKey: true,
  customer: { select: { name: true } },
  items: { select: { quantity: true, product: { select: { weightKg: true } } } },
} as const;

type PlanningOrderRow = {
  id: string;
  orderNumber: number;
  totalCents: number;
  deliveryStreet: string;
  deliveryNumber: string;
  deliveryNeighborhood: string;
  deliveryNeighborhoodKey: string;
  deliveryCity: string;
  deliveryCityKey: string;
  customer: { name: string };
  items: Array<{ quantity: { toString(): string }; product: { weightKg: { toString(): string } | null } }>;
};

function toPlanningOrder(row: PlanningOrderRow): PlanningOrder {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerName: row.customer.name,
    city: row.deliveryCity,
    cityKey: row.deliveryCityKey,
    neighborhood: row.deliveryNeighborhood,
    neighborhoodKey: row.deliveryNeighborhoodKey,
    street: row.deliveryStreet,
    number: row.deliveryNumber,
    totalCents: row.totalCents,
    items: row.items.map((item) => ({ quantityMilli: decimalStringToMilli(item.quantity.toString()), unitWeightGrams: weightGramsOf(item.product.weightKg) })),
  };
}

/** Pedidos PENDENTE sem rota na data (o que o agrupador mostra). */
async function availableOrders(db: TenantDb, date: string): Promise<PlanningOrder[]> {
  const rows = await db.order.findMany({
    where: { deliveryDate: dateStringToDbDate(date), status: "PENDENTE", routeId: null },
    select: planningOrderSelect,
    orderBy: { orderNumber: "asc" },
  });
  return rows.map(toPlanningOrder);
}

async function driverOptions(db: TenantDb): Promise<RouteDriverOption[]> {
  return db.user.findMany({ where: { role: "MOTORISTA", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

async function vehicleOptions(db: TenantDb): Promise<RouteVehicleOption[]> {
  return db.vehicle.findMany({ where: { active: true }, select: { id: true, plate: true, model: true, capacityKg: true }, orderBy: { plate: "asc" } });
}

export async function getRoutePlanning(ctx: ServiceContext, date: string): Promise<RoutePlanningDTO> {
  assertCan(ctx, "rotas.montar");
  const db = getTenantDb(ctx);
  const [orders, routes, drivers, vehicles] = await Promise.all([
    availableOrders(db, date),
    db.route.findMany({
      where: { deliveryDate: dateStringToDbDate(date) },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        driver: { select: { name: true } },
        vehicle: { select: { plate: true, capacityKg: true } },
        orders: { select: planningOrderSelect },
      },
      orderBy: { code: "asc" },
    }),
    driverOptions(db),
    vehicleOptions(db),
  ]);
  return {
    date,
    groups: groupByCityAndNeighborhood(orders),
    routes: routes.map((route) => ({
      id: route.id,
      code: route.code,
      name: route.name,
      status: route.status,
      driverName: route.driver.name,
      vehiclePlate: route.vehicle?.plate ?? null,
      capacityKg: route.vehicle?.capacityKg ?? null,
      ...summarizeLoad(route.orders.map(toPlanningOrder)),
    })),
    drivers,
    vehicles,
  };
}

export type RouteStopDTO = PlanningOrder & {
  stopSequence: number;
  complement: string | null;
  state: string;
  zipCode: string;
  referencePoint: string | null;
  amountToCollectCents: number;
  paymentMethod: PaymentMethod;
  addressLine: string;
};

export type RouteDetailDTO = {
  id: string;
  code: string;
  name: string;
  deliveryDate: string;
  status: RouteStatus;
  version: number;
  driver: RouteDriverOption & { active: boolean };
  vehicle: (RouteVehicleOption & { active: boolean }) | null;
  stops: RouteStopDTO[];
  load: LoadSummary;
  /** Links do Google Maps, um por trecho, com as paradas na ordem. */
  mapsSegments: MapsSegment[];
  /** Sem endereço do depósito, o Maps parte da localização do aparelho. */
  hasDepot: boolean;
  /** Só em rascunho: pedidos do dia que ainda podem entrar na rota, e as opções do cabeçalho. */
  available: CityGroup[];
  drivers: RouteDriverOption[];
  vehicles: RouteVehicleOption[];
};

export async function getRouteDetail(ctx: ServiceContext, id: string): Promise<RouteDetailDTO> {
  assertCan(ctx, "rotas.montar");
  const db = getTenantDb(ctx);
  const [route, company] = await Promise.all([
    db.route.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        deliveryDate: true,
        status: true,
        version: true,
        driver: { select: { id: true, name: true, active: true } },
        vehicle: { select: { id: true, plate: true, model: true, capacityKg: true, active: true } },
        orders: {
          select: {
            ...planningOrderSelect,
            stopSequence: true,
            deliveryComplement: true,
            deliveryState: true,
            deliveryZipCode: true,
            deliveryReferencePoint: true,
            amountToCollectCents: true,
            paymentMethod: true,
            customer: { select: { name: true, street: true, number: true, zipCode: true, city: true, latitude: true, longitude: true } },
          },
          orderBy: [{ stopSequence: "asc" }, { orderNumber: "asc" }],
        },
      },
    }),
    db.company.findUniqueOrThrow({
      where: { id: ctx.companyId },
      select: { depotZipCode: true, depotStreet: true, depotNumber: true, depotNeighborhood: true, depotCity: true, depotState: true, depotLatitude: true, depotLongitude: true },
    }),
  ]);
  if (!route) throw notFound();

  const stops: RouteStopDTO[] = route.orders.map((row, index) => {
    const address = addressLine({
      street: row.deliveryStreet,
      number: row.deliveryNumber,
      neighborhood: row.deliveryNeighborhood,
      city: row.deliveryCity,
      state: row.deliveryState,
      zipCode: row.deliveryZipCode,
    });
    return {
      ...toPlanningOrder(row),
      stopSequence: row.stopSequence ?? index + 1,
      complement: row.deliveryComplement,
      state: row.deliveryState,
      zipCode: row.deliveryZipCode,
      referencePoint: row.deliveryReferencePoint,
      amountToCollectCents: row.amountToCollectCents,
      paymentMethod: row.paymentMethod,
      addressLine: address,
    };
  });

  // Coordenadas vêm do cadastro atual do cliente (o pedido não guarda). Só valem se o cadastro
  // ainda aponta para o mesmo endereço do pedido; senão o Maps procura pelo endereço escrito.
  const places = route.orders.map((row, index) => ({
    address: stops[index]?.addressLine ?? "",
    ...coordinatesIfSameAddress({ zipCode: row.deliveryZipCode, street: row.deliveryStreet, number: row.deliveryNumber, city: row.deliveryCity }, row.customer),
  }));
  const hasDepot = Boolean(company.depotStreet && company.depotCity && company.depotState);
  const origin = hasDepot
    ? {
        address: addressLine({
          street: company.depotStreet ?? "",
          number: company.depotNumber ?? "",
          neighborhood: company.depotNeighborhood ?? "",
          city: company.depotCity ?? "",
          state: company.depotState ?? "",
          zipCode: company.depotZipCode ?? "",
        }),
        latitude: company.depotLatitude,
        longitude: company.depotLongitude,
      }
    : null;

  const editable = isRouteCompositionEditable(route.status);
  const deliveryDate = dbDateToDateString(route.deliveryDate);
  const [available, drivers, vehicles] = editable
    ? await Promise.all([availableOrders(db, deliveryDate), driverOptions(db), vehicleOptions(db)])
    : [[], [], []];

  return {
    id: route.id,
    code: route.code,
    name: route.name,
    deliveryDate,
    status: route.status,
    version: route.version,
    driver: route.driver,
    vehicle: route.vehicle,
    stops,
    load: summarizeLoad(stops),
    mapsSegments: buildMapsSegments(origin, places),
    hasDepot,
    available: groupByCityAndNeighborhood(available),
    drivers,
    vehicles,
  };
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

async function assertDriver(db: TenantDb | TenantTx, driverId: string): Promise<void> {
  const driver = await db.user.findFirst({ where: { id: driverId, role: "MOTORISTA", active: true }, select: { id: true } });
  if (!driver) throw new ServiceError("VALIDACAO", ROUTE_MESSAGES.driver, { driverId: ROUTE_MESSAGES.driver });
}

async function assertVehicle(db: TenantDb | TenantTx, vehicleId: string | null): Promise<void> {
  if (vehicleId === null) return;
  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, active: true }, select: { id: true } });
  if (!vehicle) throw new ServiceError("VALIDACAO", ROUTE_MESSAGES.vehicle, { vehicleId: ROUTE_MESSAGES.vehicle });
}

type RouteRow = { id: string; code: string; name: string; status: RouteStatus; version: number; deliveryDate: Date; driverId: string; vehicleId: string | null };

const routeRowSelect = { id: true, code: true, name: true, status: true, version: true, deliveryDate: true, driverId: true, vehicleId: true } as const;

async function loadRoute(db: TenantDb | TenantTx, id: string): Promise<RouteRow> {
  const route = await db.route.findUnique({ where: { id }, select: routeRowSelect });
  if (!route) throw notFound();
  return route;
}

/** Rota em rascunho na versão que o usuário viu. */
async function loadDraft(db: TenantDb | TenantTx, ref: { id: string; version: number }): Promise<RouteRow> {
  const route = await loadRoute(db, ref.id);
  if (!isRouteCompositionEditable(route.status)) throw new ServiceError("VALIDACAO", ROUTE_MESSAGES.frozen);
  if (route.version !== ref.version) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);
  return route;
}

/** Grava a nova versão da rota, só se ninguém mexeu nela desde a leitura. */
async function bumpRoute(tx: TenantTx, route: { id: string; version: number; status: RouteStatus }, data: { name?: string; driverId?: string; vehicleId?: string | null; status?: RouteStatus } = {}): Promise<number> {
  const updated = await tx.route.updateMany({ where: { id: route.id, version: route.version, status: route.status }, data: { ...data, version: { increment: 1 } } });
  if (updated.count === 0) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);
  return route.version + 1;
}

/**
 * Coloca pedidos livres na rota a partir da parada `firstStop`, na ordem dada. Cada pedido só
 * entra se ainda estiver PENDENTE, sem rota, na data da rota e na versão lida.
 */
async function attachOrders(tx: TenantTx, routeId: string, deliveryDate: Date, orderIds: readonly string[], firstStop: number): Promise<void> {
  const rows = await tx.order.findMany({
    where: { id: { in: [...orderIds] }, status: "PENDENTE", routeId: null, deliveryDate },
    select: { id: true, version: true, orderNumber: true, deliveryCityKey: true, deliveryNeighborhoodKey: true, deliveryStreet: true, deliveryNumber: true },
  });
  if (rows.length !== orderIds.length) throw new ServiceError("CONFLITO", ROUTE_MESSAGES.ordersChanged);
  const ordered = suggestStopOrder(
    rows.map((row) => ({ ...row, cityKey: row.deliveryCityKey, neighborhoodKey: row.deliveryNeighborhoodKey, street: row.deliveryStreet, number: row.deliveryNumber })),
  );
  for (const [index, order] of ordered.entries()) {
    const updated = await tx.order.updateMany({
      where: { id: order.id, version: order.version, status: "PENDENTE", routeId: null },
      data: { routeId, stopSequence: firstStop + index, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new ServiceError("CONFLITO", ROUTE_MESSAGES.ordersChanged);
  }
}

/** Renumera as paradas 1..n na ordem dada (os IDs são exatamente os pedidos da rota). */
async function writeStopOrder(tx: TenantTx, routeId: string, orderIds: readonly string[]): Promise<void> {
  for (const [index, orderId] of orderIds.entries()) {
    const updated = await tx.order.updateMany({ where: { id: orderId, routeId }, data: { stopSequence: index + 1 } });
    if (updated.count === 0) throw new ServiceError("CONFLITO", ROUTE_MESSAGES.stopsChanged);
  }
}

async function currentStopIds(tx: TenantTx, routeId: string): Promise<string[]> {
  const rows = await tx.order.findMany({ where: { routeId }, select: { id: true }, orderBy: [{ stopSequence: "asc" }, { orderNumber: "asc" }] });
  return rows.map((row) => row.id);
}

export type SavedRoute = { id: string; code: string; version: number };

export async function createRoute(ctx: ServiceContext, data: CreateRouteData): Promise<SavedRoute> {
  assertCan(ctx, "rotas.montar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  await assertDriver(db, data.driverId);
  await assertVehicle(db, data.vehicleId);
  const deliveryDate = dateStringToDbDate(data.deliveryDate);

  return db.$transaction(async (tx) => {
    const code = formatRouteCode(await nextCounterValue(tx, ctx.companyId, COUNTER_KEYS.route));
    const route = await tx.route.create({
      data: { companyId: ctx.companyId, code, name: data.name, deliveryDate, driverId: data.driverId, vehicleId: data.vehicleId },
      select: { id: true, code: true, version: true },
    });
    await attachOrders(tx, route.id, deliveryDate, data.orderIds, 1);
    return route;
  }, TX_OPTIONS);
}

export async function updateRoute(ctx: ServiceContext, data: UpdateRouteData): Promise<SavedRoute> {
  assertCan(ctx, "rotas.montar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const route = await loadDraft(db, data);
  if (data.driverId !== route.driverId) await assertDriver(db, data.driverId);
  if (data.vehicleId !== route.vehicleId) await assertVehicle(db, data.vehicleId);
  const version = await db.$transaction((tx) => bumpRoute(tx, route, { name: data.name, driverId: data.driverId, vehicleId: data.vehicleId }));
  return { id: route.id, code: route.code, version };
}

export async function addOrdersToRoute(ctx: ServiceContext, data: RouteOrdersData): Promise<SavedRoute> {
  assertCan(ctx, "rotas.montar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const route = await loadDraft(db, data);
  return db.$transaction(async (tx) => {
    const version = await bumpRoute(tx, route);
    const stops = await currentStopIds(tx, route.id);
    // Paradas existentes renumeradas 1..n (pode haver buraco de pedido cancelado); novas no fim.
    await writeStopOrder(tx, route.id, stops);
    await attachOrders(tx, route.id, route.deliveryDate, data.orderIds, stops.length + 1);
    return { id: route.id, code: route.code, version };
  }, TX_OPTIONS);
}

export async function removeOrderFromRoute(ctx: ServiceContext, data: RemoveRouteOrderData): Promise<SavedRoute> {
  assertCan(ctx, "rotas.montar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const route = await loadDraft(db, data);
  return db.$transaction(async (tx) => {
    const version = await bumpRoute(tx, route);
    const removed = await tx.order.updateMany({
      where: { id: data.orderId, routeId: route.id, status: "PENDENTE" },
      data: { routeId: null, stopSequence: null, version: { increment: 1 } },
    });
    if (removed.count === 0) throw new ServiceError("CONFLITO", ROUTE_MESSAGES.orderNotInRoute);
    await writeStopOrder(tx, route.id, await currentStopIds(tx, route.id));
    return { id: route.id, code: route.code, version };
  }, TX_OPTIONS);
}

/** Nova ordem das paradas (botões subir/descer, arrastar ou ordem sugerida). */
export async function reorderRouteStops(ctx: ServiceContext, data: RouteOrdersData): Promise<SavedRoute> {
  assertCan(ctx, "rotas.montar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const route = await loadDraft(db, data);
  return db.$transaction(async (tx) => {
    const version = await bumpRoute(tx, route);
    const current = await currentStopIds(tx, route.id);
    const sameSet = current.length === data.orderIds.length && data.orderIds.every((id) => current.includes(id));
    if (!sameSet) throw new ServiceError("CONFLITO", ROUTE_MESSAGES.stopsChanged);
    await writeStopOrder(tx, route.id, data.orderIds);
    return { id: route.id, code: route.code, version };
  }, TX_OPTIONS);
}

/** "Liberar para carga": congela a rota, pedidos vão para EM_ROTA, impressão liberada. */
export async function releaseRoute(ctx: ServiceContext, data: RouteVersionData): Promise<SavedRoute> {
  assertCan(ctx, "rotas.montar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const route = await loadDraft(db, data);
  assertRouteTransition(route.status, "LIBERADA_CARGA");
  const driver = await db.user.findFirst({ where: { id: route.driverId, role: "MOTORISTA", active: true }, select: { id: true } });
  if (!driver) throw new ServiceError("VALIDACAO", ROUTE_MESSAGES.inactiveDriver);
  if (route.vehicleId) {
    const vehicle = await db.vehicle.findFirst({ where: { id: route.vehicleId, active: true }, select: { id: true } });
    if (!vehicle) throw new ServiceError("VALIDACAO", ROUTE_MESSAGES.inactiveVehicle);
  }

  return db.$transaction(async (tx) => {
    const version = await bumpRoute(tx, route, { status: "LIBERADA_CARGA" });
    const stops = await currentStopIds(tx, route.id);
    if (stops.length === 0) throw new ServiceError("VALIDACAO", ROUTE_MESSAGES.empty);
    // Paradas 1..n sem buraco: é a numeração que sai impressa e que o motorista vê.
    await writeStopOrder(tx, route.id, stops);
    const moved = await tx.order.updateMany({ where: { routeId: route.id, status: "PENDENTE" }, data: { status: "EM_ROTA", version: { increment: 1 } } });
    if (moved.count !== stops.length) throw new ServiceError("CONFLITO", ROUTE_MESSAGES.stopsChanged);
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entity: "Route",
        entityId: route.id,
        action: "ROTA_LIBERADA",
        before: { status: route.status, version: route.version },
        after: { status: "LIBERADA_CARGA", version, orderIds: stops },
      },
    });
    return { id: route.id, code: route.code, version };
  }, TX_OPTIONS);
}

/** Volta para rascunho antes de o motorista iniciar. Só ADMIN (decisão do dono do produto). */
export async function reopenRoute(ctx: ServiceContext, data: ReopenRouteData): Promise<SavedRoute> {
  assertCan(ctx, "rotas.reabrir");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const route = await loadRoute(db, data.id);
  if (route.status !== "LIBERADA_CARGA") throw new ServiceError("VALIDACAO", ROUTE_MESSAGES.notReopenable);
  if (route.version !== data.version) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);
  assertRouteTransition(route.status, "RASCUNHO");

  return db.$transaction(async (tx) => {
    const version = await bumpRoute(tx, route, { status: "RASCUNHO" });
    const stops = await currentStopIds(tx, route.id);
    const moved = await tx.order.updateMany({ where: { routeId: route.id, status: "EM_ROTA" }, data: { status: "PENDENTE", version: { increment: 1 } } });
    if (moved.count !== stops.length) throw new ServiceError("CONFLITO", ROUTE_MESSAGES.stopsChanged);
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entity: "Route",
        entityId: route.id,
        action: "ROTA_REABERTA",
        before: { status: route.status, version: route.version },
        after: { status: "RASCUNHO", version, orderIds: stops },
        reason: data.reason,
      },
    });
    return { id: route.id, code: route.code, version };
  }, TX_OPTIONS);
}

/** Exclui rota em rascunho: pedidos voltam para "sem rota"; o código não é reaproveitado. */
export async function deleteDraftRoute(ctx: ServiceContext, data: RouteVersionData): Promise<void> {
  assertCan(ctx, "rotas.montar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const route = await loadRoute(db, data.id);
  if (route.status !== "RASCUNHO") throw new ServiceError("VALIDACAO", ROUTE_MESSAGES.notDeletable);
  if (route.version !== data.version) throw new ServiceError("CONFLITO", MESSAGES.staleVersion);

  await db.$transaction(async (tx) => {
    await bumpRoute(tx, route);
    const stops = await currentStopIds(tx, route.id);
    const released = await tx.order.updateMany({ where: { routeId: route.id, status: "PENDENTE" }, data: { routeId: null, stopSequence: null, version: { increment: 1 } } });
    if (released.count !== stops.length) throw new ServiceError("CONFLITO", ROUTE_MESSAGES.stopsChanged);
    await tx.route.delete({ where: { id: route.id } });
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entity: "Route",
        entityId: route.id,
        action: "ROTA_EXCLUIDA",
        before: {
          code: route.code,
          name: route.name,
          deliveryDate: dbDateToDateString(route.deliveryDate),
          driverId: route.driverId,
          vehicleId: route.vehicleId,
          version: route.version,
          orderIds: stops,
        },
      },
    });
  }, TX_OPTIONS);
}
