// Dados do dashboard (seção 5.3) para a data selecionada.

import "server-only";

import { isSettlementOverdue, summarizeDay, type DashboardSummary } from "../../domain/dashboard";
import { dateStringToDbDate, dayOfWeekOfDateString, dbDateToDateString } from "../../domain/dates";
import { isTemplateDueOn } from "../../domain/recurrence";
import { type ServiceContext, assertCan } from "../auth/context";
import { getTenantDb } from "../tenant-db";

/** Quantos itens cada alerta lista na tela (o total aparece sempre). */
const ALERT_LIST_LIMIT = 10;

export type DashboardData = {
  date: string;
  summary: DashboardSummary;
  alerts: {
    /** Templates que valem para a data e ainda não geraram pedido. */
    templatesNotGenerated: Array<{ templateId: string; customerName: string }>;
    /** Pedidos não entregues (de qualquer data) que ainda não foram reagendados. */
    notDeliveredWithoutReschedule: { total: number; items: Array<{ orderNumber: number; customerName: string; deliveryDate: string }> };
    /** Rotas aguardando acerto há mais de 12 horas (de qualquer data). */
    overdueSettlements: Array<{ code: string; name: string; deliveryDate: string }>;
  };
};

export async function getDashboard(ctx: ServiceContext, date: string, now: Date = new Date()): Promise<DashboardData> {
  assertCan(ctx, "painel.acessar");
  const db = getTenantDb(ctx);
  const deliveryDate = dateStringToDbDate(date);

  const [orders, routes, templates, notDeliveredTotal, notDelivered, awaitingSettlement] = await Promise.all([
    db.order.findMany({
      where: { deliveryDate },
      select: {
        status: true,
        paymentStatus: true,
        amountToCollectCents: true,
        routeId: true,
        deliveryProof: { select: { cashCollectedCents: true, pixCollectedCents: true } },
      },
    }),
    db.route.findMany({ where: { deliveryDate }, select: { status: true } }),
    db.recurringOrderTemplate.findMany({
      where: { active: true, dayOfWeek: dayOfWeekOfDateString(date), customer: { active: true } },
      select: {
        id: true,
        dayOfWeek: true,
        active: true,
        startsOn: true,
        pausedUntil: true,
        customer: { select: { name: true } },
        orders: { where: { deliveryDate }, select: { id: true }, take: 1 },
      },
      orderBy: { customer: { name: "asc" } },
    }),
    db.order.count({ where: { status: "NAO_ENTREGUE", rescheduledTo: { is: null } } }),
    db.order.findMany({
      where: { status: "NAO_ENTREGUE", rescheduledTo: { is: null } },
      select: { orderNumber: true, deliveryDate: true, customer: { select: { name: true } } },
      orderBy: [{ deliveryDate: "desc" }, { orderNumber: "desc" }],
      take: ALERT_LIST_LIMIT,
    }),
    db.route.findMany({
      where: { status: "AGUARDANDO_ACERTO" },
      select: { code: true, name: true, status: true, deliveryDate: true, finishedAt: true, updatedAt: true },
      orderBy: { deliveryDate: "asc" },
    }),
  ]);

  const summary = summarizeDay(
    orders.map((order) => ({
      status: order.status,
      paymentStatus: order.paymentStatus,
      amountToCollectCents: order.amountToCollectCents,
      routeId: order.routeId,
      proof: order.deliveryProof,
    })),
    routes,
  );

  const templatesNotGenerated = templates
    .filter(
      (template) =>
        template.orders.length === 0 &&
        isTemplateDueOn(
          {
            dayOfWeek: template.dayOfWeek,
            active: template.active,
            startsOn: dbDateToDateString(template.startsOn),
            pausedUntil: template.pausedUntil ? dbDateToDateString(template.pausedUntil) : null,
          },
          date,
        ),
    )
    .map((template) => ({ templateId: template.id, customerName: template.customer.name }));

  return {
    date,
    summary,
    alerts: {
      templatesNotGenerated,
      notDeliveredWithoutReschedule: {
        total: notDeliveredTotal,
        items: notDelivered.map((order) => ({
          orderNumber: order.orderNumber,
          customerName: order.customer.name,
          deliveryDate: dbDateToDateString(order.deliveryDate),
        })),
      },
      overdueSettlements: awaitingSettlement
        .filter((route) => isSettlementOverdue(route, now))
        .map((route) => ({ code: route.code, name: route.name, deliveryDate: dbDateToDateString(route.deliveryDate) })),
    },
  };
}
