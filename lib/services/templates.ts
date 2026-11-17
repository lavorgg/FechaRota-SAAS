// Templates de pedido recorrente: tela mínima pedida pelo dono do produto (ver, editar,
// pausar, desativar). A fonte única de verdade da recorrência é esta tabela (seção 4).

import "server-only";

import { type DayOfWeek, dateStringToDbDate, dbDateToDateString } from "../../domain/dates";
import { priceOrderLines } from "../../domain/order-lines";
import { type ProductUnit, milliToDecimalString } from "../../domain/quantity";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { ServiceError, notFound } from "../errors";
import { decimalToMilli } from "../mappers/decimal";
import { getTenantDb } from "../tenant-db";
import type { CreateTemplateData, PauseTemplateData, UpdateTemplateData } from "../validation/orders";

export type TemplateDTO = {
  id: string;
  dayOfWeek: DayOfWeek;
  active: boolean;
  startsOn: string;
  pausedUntil: string | null;
  notes: string | null;
  items: Array<{ productId: string; sku: string; productName: string; unit: ProductUnit; productActive: boolean; quantityMilli: number; unitPriceCents: number | null; currentPriceCents: number }>;
};

const select = {
  id: true,
  dayOfWeek: true,
  active: true,
  startsOn: true,
  pausedUntil: true,
  notes: true,
  items: {
    select: { productId: true, quantity: true, unitPriceCents: true, product: { select: { sku: true, name: true, unit: true, active: true, priceCents: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type Row = {
  id: string;
  dayOfWeek: DayOfWeek;
  active: boolean;
  startsOn: Date;
  pausedUntil: Date | null;
  notes: string | null;
  items: Array<{ productId: string; quantity: { toFixed(d: number): string }; unitPriceCents: number | null; product: { sku: string; name: string; unit: ProductUnit; active: boolean; priceCents: number } }>;
};

function toDTO(row: Row): TemplateDTO {
  return {
    id: row.id,
    dayOfWeek: row.dayOfWeek,
    active: row.active,
    startsOn: dbDateToDateString(row.startsOn),
    pausedUntil: row.pausedUntil ? dbDateToDateString(row.pausedUntil) : null,
    notes: row.notes,
    items: row.items.map((item) => ({
      productId: item.productId,
      sku: item.product.sku,
      productName: item.product.name,
      unit: item.product.unit,
      productActive: item.product.active,
      quantityMilli: decimalToMilli(item.quantity),
      unitPriceCents: item.unitPriceCents,
      currentPriceCents: item.product.priceCents,
    })),
  };
}

const DAY_ORDER: Record<DayOfWeek, number> = { DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6 };

export async function listCustomerTemplates(ctx: ServiceContext, customerId: string): Promise<TemplateDTO[]> {
  assertCan(ctx, "pedidos.gerenciar");
  const rows = await getTenantDb(ctx).recurringOrderTemplate.findMany({ where: { customerId }, select });
  return rows.map(toDTO).sort((a, b) => Number(b.active) - Number(a.active) || DAY_ORDER[a.dayOfWeek] - DAY_ORDER[b.dayOfWeek]);
}

/** Valida os itens com as mesmas regras do pedido (produto ativo, quantidade pela unidade). */
async function validatedItems(ctx: ServiceContext, items: CreateTemplateData["items"]) {
  const db = getTenantDb(ctx);
  const products = await db.product.findMany({
    where: { id: { in: [...new Set(items.map((item) => item.productId))] } },
    select: { id: true, name: true, unit: true, priceCents: true, active: true },
  });
  const priced = priceOrderLines(items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPriceCents: item.unitPrice })), new Map(products.map((p) => [p.id, p])));
  if (!priced.ok) {
    const fieldErrors = Object.fromEntries(Object.entries(priced.lineErrors).map(([index, message]) => [`items.${index}`, message]));
    throw new ServiceError("VALIDACAO", priced.error, { items: priced.error, ...fieldErrors });
  }
  // Sem companyId: no create aninhado ele vem do template; no createMany o client por empresa injeta.
  return priced.lines.map((line, index) => ({
    productId: line.productId,
    quantity: milliToDecimalString(line.quantityMilli),
    unitPriceCents: items[index]?.unitPrice ?? null,
  }));
}

export async function createTemplate(ctx: ServiceContext, data: CreateTemplateData): Promise<TemplateDTO> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.customer.findUnique({ where: { id: data.customerId }, select: { id: true } }))) throw notFound();
  const items = await validatedItems(ctx, data.items);
  const row = await db.recurringOrderTemplate.create({
    data: {
      companyId: ctx.companyId,
      customerId: data.customerId,
      dayOfWeek: data.dayOfWeek,
      startsOn: dateStringToDbDate(data.startsOn),
      notes: data.notes,
      items: { create: items },
    },
    select,
  });
  return toDTO(row);
}

/** Mudar itens ou dia vale para as próximas gerações; pedidos já gerados não mudam. */
export async function updateTemplate(ctx: ServiceContext, data: UpdateTemplateData): Promise<TemplateDTO> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.recurringOrderTemplate.findUnique({ where: { id: data.id }, select: { id: true } }))) throw notFound();
  const items = await validatedItems(ctx, data.items);
  return db.$transaction(async (tx) => {
    await tx.recurringOrderTemplateItem.deleteMany({ where: { templateId: data.id } });
    await tx.recurringOrderTemplateItem.createMany({ data: items.map((item) => ({ ...item, companyId: ctx.companyId, templateId: data.id })) });
    return toDTO(
      await tx.recurringOrderTemplate.update({
        where: { id: data.id },
        data: { dayOfWeek: data.dayOfWeek, startsOn: dateStringToDbDate(data.startsOn), notes: data.notes },
        select,
      }),
    );
  });
}

/** Pausa até uma data (inclusive) ou retoma com `null`. */
export async function pauseTemplate(ctx: ServiceContext, data: PauseTemplateData): Promise<TemplateDTO> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.recurringOrderTemplate.findUnique({ where: { id: data.id }, select: { id: true } }))) throw notFound();
  return toDTO(await db.recurringOrderTemplate.update({ where: { id: data.id }, data: { pausedUntil: data.pausedUntil ? dateStringToDbDate(data.pausedUntil) : null }, select }));
}

export async function setTemplateActive(ctx: ServiceContext, id: string, active: boolean): Promise<TemplateDTO> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.recurringOrderTemplate.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  return toDTO(await db.recurringOrderTemplate.update({ where: { id }, data: { active }, select }));
}
