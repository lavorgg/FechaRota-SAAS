// Gerador de pedidos recorrentes (seção 5.5). Tudo numa transação; rodar duas vezes não
// duplica nada (`@@unique([recurringTemplateId, deliveryDate])` + checagem prévia).

import "server-only";

import { dateStringToDbDate, dayOfWeekOfDateString, dbDateToDateString } from "../../domain/dates";
import { calcAmountToCollectCents, initialPaymentStatus } from "../../domain/payment";
import { milliToDecimalString } from "../../domain/quantity";
import { type TemplateForGeneration, planRecurringGeneration } from "../../domain/recurrence-plan";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { COUNTER_KEYS, nextCounterValue } from "../counters";
import { MESSAGES, ServiceError, prismaErrorCode } from "../errors";
import { decimalToMilli } from "../mappers/decimal";
import { getTenantDb } from "../tenant-db";

const addressFields = {
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

export type GenerationResult = {
  date: string;
  created: Array<{ orderNumber: number; customerName: string }>;
  alreadyExisted: number;
  ignored: Array<{ customerName: string; reason: string }>;
};

export async function generateRecurringOrders(ctx: ServiceContext, date: string): Promise<GenerationResult> {
  assertCan(ctx, "pedidos.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const deliveryDate = dateStringToDbDate(date);

  try {
    return await db.$transaction(
      async (tx) => {
        // Trava a numeração de pedidos da empresa até o fim da transação: dois geradores ao
        // mesmo tempo passam um de cada vez, e o segundo já enxerga o que o primeiro criou.
        await tx.companyCounter.createMany({ data: [{ companyId: ctx.companyId, key: COUNTER_KEYS.order, value: 0 }], skipDuplicates: true });
        await tx.companyCounter.update({ where: { companyId_key: { companyId: ctx.companyId, key: COUNTER_KEYS.order } }, data: { value: { increment: 0 } } });

        const rows = await tx.recurringOrderTemplate.findMany({
          where: { active: true, dayOfWeek: dayOfWeekOfDateString(date) },
          select: {
            id: true,
            dayOfWeek: true,
            active: true,
            startsOn: true,
            pausedUntil: true,
            customer: { select: { id: true, name: true, active: true, defaultPaymentMethod: true, ...addressFields } },
            items: {
              select: { quantity: true, unitPriceCents: true, product: { select: { id: true, sku: true, name: true, unit: true, priceCents: true, active: true } } },
              orderBy: { createdAt: "asc" },
            },
            orders: { where: { deliveryDate }, select: { id: true }, take: 1 },
          },
          orderBy: { customer: { name: "asc" } },
        });

        const templates: TemplateForGeneration[] = rows.map((row) => ({
          id: row.id,
          schedule: {
            dayOfWeek: row.dayOfWeek,
            active: row.active,
            startsOn: dbDateToDateString(row.startsOn),
            pausedUntil: row.pausedUntil ? dbDateToDateString(row.pausedUntil) : null,
          },
          customer: row.customer,
          items: row.items.map((item) => ({ quantityMilli: decimalToMilli(item.quantity), unitPriceCents: item.unitPriceCents, product: item.product })),
          hasOrderOnDate: row.orders.length > 0,
        }));
        const plan = planRecurringGeneration(templates, date);
        const customers = new Map(rows.map((row) => [row.customer.id, row.customer]));

        const created: GenerationResult["created"] = [];
        for (const planned of plan.toCreate) {
          const customer = customers.get(planned.customerId);
          if (!customer) continue;
          const orderNumber = await nextCounterValue(tx, ctx.companyId, COUNTER_KEYS.order);
          await tx.order.create({
            data: {
              companyId: ctx.companyId,
              orderNumber,
              customerId: customer.id,
              recurringTemplateId: planned.templateId,
              deliveryDate,
              status: "PENDENTE",
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
              paymentMethod: planned.paymentMethod,
              totalCents: planned.totalCents,
              amountToCollectCents: calcAmountToCollectCents(planned.paymentMethod, planned.totalCents),
              paymentStatus: initialPaymentStatus(planned.paymentMethod),
              items: {
                create: planned.lines.map((line) => ({
                  productId: line.productId,
                  productName: line.productName,
                  unit: line.unit,
                  quantity: milliToDecimalString(line.quantityMilli),
                  unitPriceCents: line.unitPriceCents,
                  subtotalCents: line.subtotalCents,
                })),
              },
            },
          });
          created.push({ orderNumber, customerName: planned.customerName });
        }

        const result: GenerationResult = {
          date,
          created,
          alreadyExisted: plan.alreadyExisted,
          ignored: plan.ignored.map(({ customerName, reason }) => ({ customerName, reason })),
        };
        await tx.auditLog.create({
          data: {
            companyId: ctx.companyId,
            userId: ctx.userId,
            entity: "RecurringOrderTemplate",
            entityId: date,
            action: "RECORRENTES_GERADOS",
            after: { date, created: created.length, alreadyExisted: plan.alreadyExisted, ignored: plan.ignored.length },
          },
        });
        return result;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (error) {
    const code = prismaErrorCode(error);
    if (code === "P2002" || code === "P2034") throw new ServiceError("CONFLITO", MESSAGES.concurrentChange);
    throw error;
  }
}
