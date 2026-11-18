// Dados dos romaneios para impressão (seção 5.6). Só depois da liberação para carga, quando a
// composição da rota está congelada.
//
// O que vem do pedido (nome do produto, unidade, endereço) é o snapshot gravado no pedido
// (seção 3.7). SKU, peso e vasilhame não têm snapshot no modelo: vêm do cadastro atual.

import "server-only";

import { type CargoItemInput, type CargoManifest, buildCargoManifest } from "../../domain/cargo-manifest";
import { dbDateToDateString, formatInstant } from "../../domain/dates";
import { addressLine } from "../../domain/maps";
import type { PaymentMethod } from "../../domain/payment";
import { type ProductUnit, decimalStringToMilli } from "../../domain/quantity";
import { type RouteStatus, isRoutePrintable } from "../../domain/route-status";
import { type ServiceContext, assertCan } from "../auth/context";
import { ServiceError, notFound } from "../errors";
import { type TenantDb, getTenantDb } from "../tenant-db";
import { containerBalances } from "./container-balance";

export const MANIFEST_MESSAGES = {
  notPrintable: "Os romaneios só podem ser impressos depois que a rota é liberada para carga.",
} as const;

export type ManifestHeader = {
  companyName: string;
  companyCnpj: string | null;
  routeCode: string;
  routeName: string;
  routeVersion: number;
  routeStatus: RouteStatus;
  deliveryDate: string;
  driverName: string;
  vehicle: { plate: string; model: string } | null;
  /** Data e hora da geração, no fuso da empresa. */
  generatedAt: string;
};

async function loadPrintableRoute(db: TenantDb, id: string) {
  const route = await db.route.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      version: true,
      deliveryDate: true,
      driver: { select: { name: true } },
      vehicle: { select: { plate: true, model: true } },
    },
  });
  if (!route) throw notFound();
  if (!isRoutePrintable(route.status)) throw new ServiceError("VALIDACAO", MANIFEST_MESSAGES.notPrintable);
  return route;
}

async function buildHeader(ctx: ServiceContext, db: TenantDb, route: Awaited<ReturnType<typeof loadPrintableRoute>>, now: Date): Promise<ManifestHeader> {
  const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true, cnpj: true } });
  return {
    companyName: company.name,
    companyCnpj: company.cnpj,
    routeCode: route.code,
    routeName: route.name,
    routeVersion: route.version,
    routeStatus: route.status,
    deliveryDate: dbDateToDateString(route.deliveryDate),
    driverName: route.driver.name,
    vehicle: route.vehicle,
    generatedAt: formatInstant(now, ctx.timezone),
  };
}

const cargoItemSelect = {
  orderId: true,
  productId: true,
  productName: true,
  unit: true,
  quantity: true,
  product: {
    select: {
      sku: true,
      weightKg: true,
      unitsPerContainer: true,
      containerProduct: { select: { id: true, sku: true, name: true } },
    },
  },
} as const;

type CargoItemRow = {
  orderId: string;
  productId: string;
  productName: string;
  unit: ProductUnit;
  quantity: { toString(): string };
  product: {
    sku: string;
    weightKg: { toString(): string } | null;
    unitsPerContainer: number | null;
    containerProduct: { id: string; sku: string; name: string } | null;
  };
};

function toCargoItem(row: CargoItemRow): CargoItemInput {
  const container = row.product.containerProduct;
  return {
    orderId: row.orderId,
    productId: row.productId,
    sku: row.product.sku,
    productName: row.productName,
    unit: row.unit,
    quantityMilli: decimalStringToMilli(row.quantity.toString()),
    unitWeightGrams: row.product.weightKg === null ? null : decimalStringToMilli(row.product.weightKg.toString()),
    container: container ? { productId: container.id, sku: container.sku, name: container.name, unitsPerContainer: row.product.unitsPerContainer } : null,
  };
}

export type CargoManifestDTO = { header: ManifestHeader; manifest: CargoManifest };

/** Romaneio de Carga: tudo o que sai no caminhão, consolidado por produto. */
export async function getCargoManifest(ctx: ServiceContext, routeId: string, now: Date = new Date()): Promise<CargoManifestDTO> {
  assertCan(ctx, "rotas.montar");
  const db = getTenantDb(ctx);
  const route = await loadPrintableRoute(db, routeId);
  const [header, items] = await Promise.all([
    buildHeader(ctx, db, route, now),
    db.orderItem.findMany({ where: { order: { routeId: route.id } }, select: cargoItemSelect, orderBy: [{ productName: "asc" }, { id: "asc" }] }),
  ]);
  return { header, manifest: buildCargoManifest(items.map(toCargoItem)) };
}

export type DeliveryStopItemDTO = { productName: string; unit: ProductUnit; quantityMilli: number };

export type DeliveryStopDTO = {
  stopSequence: number;
  orderNumber: number;
  invoiceNumber: string | null;
  customerName: string;
  addressLine: string;
  complement: string | null;
  referencePoint: string | null;
  phone: string | null;
  deliveryWindow: string | null;
  notes: string | null;
  items: DeliveryStopItemDTO[];
  totalCents: number;
  amountToCollectCents: number;
  paymentMethod: PaymentMethod;
  /** Saldo de vasilhames do cliente antes desta entrega (entregues − devolvidos), por tipo. */
  containerBalance: Array<{ sku: string; name: string; balance: number }>;
};

export type DeliveryManifestDTO = { header: ManifestHeader; stops: DeliveryStopDTO[] };

/** Romaneio de Entrega: uma seção por parada, na ordem. */
export async function getDeliveryManifest(ctx: ServiceContext, routeId: string, now: Date = new Date()): Promise<DeliveryManifestDTO> {
  assertCan(ctx, "rotas.montar");
  const db = getTenantDb(ctx);
  const route = await loadPrintableRoute(db, routeId);
  const [header, orders] = await Promise.all([
    buildHeader(ctx, db, route, now),
    db.order.findMany({
      where: { routeId: route.id },
      select: {
        id: true,
        orderNumber: true,
        stopSequence: true,
        invoiceNumber: true,
        customerId: true,
        deliveryStreet: true,
        deliveryNumber: true,
        deliveryComplement: true,
        deliveryNeighborhood: true,
        deliveryCity: true,
        deliveryState: true,
        deliveryZipCode: true,
        deliveryReferencePoint: true,
        notes: true,
        totalCents: true,
        amountToCollectCents: true,
        paymentMethod: true,
        customer: { select: { name: true, phone: true, deliveryWindow: true } },
        items: { select: { productName: true, unit: true, quantity: true }, orderBy: { id: "asc" } },
      },
      orderBy: [{ stopSequence: "asc" }, { orderNumber: "asc" }],
    }),
  ]);

  const balances = await containerBalances(
    db,
    [...new Set(orders.map((order) => order.customerId))],
    orders.map((order) => order.id),
  );

  const stops = orders.map((order, index) => ({
    stopSequence: order.stopSequence ?? index + 1,
    orderNumber: order.orderNumber,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customer.name,
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
    phone: order.customer.phone,
    deliveryWindow: order.customer.deliveryWindow,
    notes: order.notes,
    items: order.items.map((item) => ({ productName: item.productName, unit: item.unit, quantityMilli: decimalStringToMilli(item.quantity.toString()) })),
    totalCents: order.totalCents,
    amountToCollectCents: order.amountToCollectCents,
    paymentMethod: order.paymentMethod,
    containerBalance: (balances.get(order.customerId) ?? []).map(({ sku, name, balance }) => ({ sku, name, balance })),
  }));
  return { header, stops };
}
