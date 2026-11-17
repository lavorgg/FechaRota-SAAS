// Rotas do motorista para hoje (seção 5.7, "Lista"). Só as rotas atribuídas ao próprio usuário.

import "server-only";

import { dateStringToDbDate, todayInTimeZone } from "../../domain/dates";
import type { RouteStatus } from "../../domain/route-status";
import { type ServiceContext, assertCan } from "../auth/context";
import { getTenantDb } from "../tenant-db";

export type DriverRouteDTO = {
  id: string;
  code: string;
  name: string;
  status: RouteStatus;
  stops: number;
  vehiclePlate: string | null;
};

export async function listDriverRoutesForToday(ctx: ServiceContext, now: Date = new Date()): Promise<{ date: string; routes: DriverRouteDTO[] }> {
  assertCan(ctx, "entregas.registrar");
  const date = todayInTimeZone(ctx.timezone, now);
  const routes = await getTenantDb(ctx).route.findMany({
    where: { driverId: ctx.userId, deliveryDate: dateStringToDbDate(date) },
    select: { id: true, code: true, name: true, status: true, vehicle: { select: { plate: true } }, _count: { select: { orders: true } } },
    orderBy: { code: "asc" },
  });
  return {
    date,
    routes: routes.map((route) => ({
      id: route.id,
      code: route.code,
      name: route.name,
      status: route.status,
      stops: route._count.orders,
      vehiclePlate: route.vehicle?.plate ?? null,
    })),
  };
}
