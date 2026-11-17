// Produtos (seção 5.4), com vasilhame retornável.

import "server-only";

import type { ProductUnit } from "../../domain/quantity";
import { milliToDecimalString } from "../../domain/quantity";
import { productSearchText } from "../../domain/search";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { ServiceError, notFound } from "../errors";
import { nullableDecimalToMilli } from "../mappers/decimal";
import { type TenantDb, getTenantDb } from "../tenant-db";
import type { ListQuery, ProductData, UpdateProductData } from "../validation/catalog";
import { type Page, activeWhere, pageBounds, rethrowDeleteError, rethrowUnique, searchWhere } from "./common";

export type ProductDTO = {
  id: string;
  sku: string;
  name: string;
  unit: ProductUnit;
  priceCents: number;
  /** Peso por unidade, em gramas (nulo = sem peso cadastrado). */
  weightGrams: number | null;
  isReturnableContainer: boolean;
  containerProductId: string | null;
  containerSku: string | null;
  unitsPerContainer: number | null;
  active: boolean;
};

export const PRODUCT_MESSAGES = {
  skuInUse: "Já existe um produto com este SKU.",
  invalidContainer: "Escolha um vasilhame retornável ativo.",
  containerInUse: (count: number) =>
    `Este vasilhame está ligado a ${count} ${count === 1 ? "produto" : "produtos"}. Tire a ligação antes de desmarcar "retornável".`,
} as const;

const select = {
  id: true,
  sku: true,
  name: true,
  unit: true,
  priceCents: true,
  weightKg: true,
  isReturnableContainer: true,
  containerProductId: true,
  unitsPerContainer: true,
  active: true,
  containerProduct: { select: { sku: true } },
} as const;

type Row = {
  id: string;
  sku: string;
  name: string;
  unit: ProductUnit;
  priceCents: number;
  weightKg: { toFixed(digits: number): string } | null;
  isReturnableContainer: boolean;
  containerProductId: string | null;
  unitsPerContainer: number | null;
  active: boolean;
  containerProduct: { sku: string } | null;
};

function toDTO(row: Row): ProductDTO {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    priceCents: row.priceCents,
    weightGrams: nullableDecimalToMilli(row.weightKg),
    isReturnableContainer: row.isReturnableContainer,
    containerProductId: row.containerProductId,
    containerSku: row.containerProduct?.sku ?? null,
    unitsPerContainer: row.unitsPerContainer,
    active: row.active,
  };
}

function toRecord(data: ProductData) {
  return {
    sku: data.sku,
    name: data.name,
    unit: data.unit,
    priceCents: data.price,
    weightKg: data.weightKg === null ? null : milliToDecimalString(data.weightKg),
    isReturnableContainer: data.isReturnableContainer,
    containerProductId: data.containerProductId,
    unitsPerContainer: data.containerProductId ? data.unitsPerContainer : null,
    searchText: productSearchText({ sku: data.sku, name: data.name }),
  };
}

async function assertValidContainer(db: TenantDb, containerId: string | null, selfId?: string): Promise<void> {
  if (!containerId) return;
  if (containerId === selfId) throw new ServiceError("VALIDACAO", PRODUCT_MESSAGES.invalidContainer, { containerProductId: PRODUCT_MESSAGES.invalidContainer });
  const container = await db.product.findUnique({ where: { id: containerId }, select: { isReturnableContainer: true, active: true } });
  if (!container || !container.isReturnableContainer || !container.active) {
    throw new ServiceError("VALIDACAO", PRODUCT_MESSAGES.invalidContainer, { containerProductId: PRODUCT_MESSAGES.invalidContainer });
  }
}

export async function listProducts(ctx: ServiceContext, query: ListQuery): Promise<Page<ProductDTO>> {
  assertCan(ctx, "cadastros.gerenciar");
  const db = getTenantDb(ctx);
  const where = { ...activeWhere(query.status), ...searchWhere(query.q) };
  const total = await db.product.count({ where });
  const { page, pageCount, skip } = pageBounds(total, query.page);
  const rows = await db.product.findMany({ where, select, orderBy: [{ active: "desc" }, { sku: "asc" }], skip, take: 20 });
  return { items: rows.map(toDTO), total, page, pageCount };
}

/** Vasilhames ativos, para o campo "sai no vasilhame". */
export async function listContainerOptions(ctx: ServiceContext): Promise<Array<{ id: string; sku: string; name: string }>> {
  assertCan(ctx, "cadastros.gerenciar");
  return getTenantDb(ctx).product.findMany({
    where: { isReturnableContainer: true, active: true },
    select: { id: true, sku: true, name: true },
    orderBy: { sku: "asc" },
  });
}

export async function createProduct(ctx: ServiceContext, data: ProductData): Promise<ProductDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  await assertValidContainer(db, data.containerProductId);
  try {
    return toDTO(await db.product.create({ data: { companyId: ctx.companyId, ...toRecord(data) }, select }));
  } catch (error) {
    rethrowUnique(error, "sku", PRODUCT_MESSAGES.skuInUse);
  }
}

export async function updateProduct(ctx: ServiceContext, data: UpdateProductData): Promise<ProductDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const { id, ...fields } = data;
  const current = await db.product.findUnique({ where: { id }, select: { id: true, isReturnableContainer: true } });
  if (!current) throw notFound();
  await assertValidContainer(db, fields.containerProductId, id);

  if (current.isReturnableContainer && !fields.isReturnableContainer) {
    const linked = await db.product.count({ where: { containerProductId: id } });
    if (linked > 0) throw new ServiceError("VALIDACAO", PRODUCT_MESSAGES.containerInUse(linked), { isReturnableContainer: PRODUCT_MESSAGES.containerInUse(linked) });
  }
  // Preço e nome novos não mudam pedidos já lançados: eles guardam a cópia (seção 3.7).
  try {
    return toDTO(await db.product.update({ where: { id }, data: toRecord(fields), select }));
  } catch (error) {
    rethrowUnique(error, "sku", PRODUCT_MESSAGES.skuInUse);
  }
}

export async function setProductActive(ctx: ServiceContext, id: string, active: boolean): Promise<ProductDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  return toDTO(await db.product.update({ where: { id }, data: { active }, select }));
}

export async function deleteProduct(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  try {
    await db.product.delete({ where: { id } });
  } catch (error) {
    rethrowDeleteError(error);
  }
}
