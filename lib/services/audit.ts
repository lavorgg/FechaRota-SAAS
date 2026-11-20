// Consulta do registro de auditoria (seção 3.11). Só ADMIN (decisão do dono do produto).
// Mostra quem, quando, o quê, sobre qual registro e o motivo; nunca dado sensível.

import "server-only";

import { type AuditChange, auditActionLabel, auditChanges } from "../../domain/audit";
import { addDays, formatInstant, startOfDayInTimeZone } from "../../domain/dates";
import { type ServiceContext, assertCan } from "../auth/context";
import { getTenantDb } from "../tenant-db";
import type { ListAuditData } from "../validation/audit";
import { pageBounds } from "./common";

export const AUDIT_PAGE_SIZE = 50;

export type AuditEntryDTO = {
  id: string;
  createdAt: string;
  userName: string;
  action: string;
  actionLabel: string;
  subject: string;
  reason: string | null;
  changes: AuditChange[];
};

export type AuditPage = { items: AuditEntryDTO[]; total: number; page: number; pageCount: number; actions: Array<{ value: string; label: string }> };

export async function listAuditLogs(ctx: ServiceContext, filters: ListAuditData): Promise<AuditPage> {
  assertCan(ctx, "auditoria.consultar");
  const db = getTenantDb(ctx);
  const createdAt = {
    ...(filters.de ? { gte: startOfDayInTimeZone(filters.de, ctx.timezone) } : {}),
    ...(filters.ate ? { lt: startOfDayInTimeZone(addDays(filters.ate, 1), ctx.timezone) } : {}),
  };
  const where = { ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}), ...(filters.tipo ? { action: filters.tipo } : {}) };

  const [total, kinds] = await Promise.all([db.auditLog.count({ where }), db.auditLog.groupBy({ by: ["action"], _count: { _all: true } })]);
  const { page, pageCount, skip } = pageBounds(total, filters.pagina, AUDIT_PAGE_SIZE);
  const rows = await db.auditLog.findMany({
    where,
    select: { id: true, createdAt: true, action: true, entity: true, entityId: true, before: true, after: true, reason: true, user: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take: AUDIT_PAGE_SIZE,
  });

  // Nome legível de cada registro citado (pedido, rota, usuário...), numa consulta por tipo.
  const idsOf = (entity: string) => [...new Set(rows.filter((row) => row.entity === entity).map((row) => row.entityId))];
  const [orders, routes, users] = await Promise.all([
    db.order.findMany({ where: { id: { in: idsOf("Order") } }, select: { id: true, orderNumber: true, customer: { select: { name: true } } } }),
    db.route.findMany({ where: { id: { in: idsOf("Route") } }, select: { id: true, code: true, name: true } }),
    db.user.findMany({ where: { id: { in: idsOf("User") } }, select: { id: true, name: true } }),
  ]);
  const orderById = new Map(orders.map((order) => [order.id, `Pedido nº ${order.orderNumber} · ${order.customer.name}`]));
  const routeById = new Map(routes.map((route) => [route.id, `Rota ${route.code} · ${route.name}`]));
  const userById = new Map(users.map((user) => [user.id, `Usuário ${user.name}`]));
  const subject = (entity: string, entityId: string, before: unknown): string => {
    if (entity === "Order") return orderById.get(entityId) ?? "Pedido";
    if (entity === "Route") {
      // Rascunho excluído: o código ficou guardado no "antes".
      const code = (before as { code?: unknown } | null)?.code;
      return routeById.get(entityId) ?? (typeof code === "string" ? `Rota ${code} (excluída)` : "Rota");
    }
    if (entity === "User") return userById.get(entityId) ?? "Usuário";
    if (entity === "Company") return "Empresa";
    if (entity === "Customer") return "Clientes";
    if (entity === "Product") return "Produtos";
    if (entity === "RecurringOrderTemplate") return "Pedidos recorrentes";
    if (entity === "FileObject") return "Arquivos de comprovante";
    return entity;
  };

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: formatInstant(row.createdAt, ctx.timezone),
      userName: row.user?.name ?? "Sistema",
      action: row.action,
      actionLabel: auditActionLabel(row.action),
      subject: subject(row.entity, row.entityId, row.before),
      reason: row.reason,
      changes: auditChanges(row.before, row.after),
    })),
    total,
    page,
    pageCount,
    actions: kinds.map((kind) => ({ value: kind.action, label: auditActionLabel(kind.action) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
  };
}
