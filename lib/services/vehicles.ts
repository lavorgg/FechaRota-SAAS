// Veículos (seção 5.4).

import "server-only";

import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { notFound } from "../errors";
import { getTenantDb } from "../tenant-db";
import type { ListQuery, UpdateVehicleData, VehicleData } from "../validation/catalog";
import { type Page, activeWhere, pageBounds, rethrowDeleteError, rethrowUnique } from "./common";

export type VehicleDTO = { id: string; plate: string; model: string; capacityKg: number | null; active: boolean };

const select = { id: true, plate: true, model: true, capacityKg: true, active: true } as const;
const PLATE_IN_USE = "Já existe um veículo com esta placa.";

export async function listVehicles(ctx: ServiceContext, query: ListQuery): Promise<Page<VehicleDTO>> {
  assertCan(ctx, "cadastros.gerenciar");
  const db = getTenantDb(ctx);
  const q = query.q?.replace(/[\s-]/g, "").toUpperCase();
  const where = {
    ...activeWhere(query.status),
    ...(q ? { OR: [{ plate: { contains: q } }, { model: { contains: query.q, mode: "insensitive" as const } }] } : {}),
  };
  const total = await db.vehicle.count({ where });
  const { page, pageCount, skip } = pageBounds(total, query.page);
  const items = await db.vehicle.findMany({ where, select, orderBy: [{ active: "desc" }, { plate: "asc" }], skip, take: 20 });
  return { items, total, page, pageCount };
}

/** Veículos ativos, para escolher na rota (Fase 4) e onde mais precisar. */
export async function listActiveVehicles(ctx: ServiceContext): Promise<VehicleDTO[]> {
  assertCan(ctx, "painel.acessar");
  return getTenantDb(ctx).vehicle.findMany({ where: { active: true }, select, orderBy: { plate: "asc" } });
}

export async function createVehicle(ctx: ServiceContext, data: VehicleData): Promise<VehicleDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  try {
    return await getTenantDb(ctx).vehicle.create({ data: { companyId: ctx.companyId, ...data }, select });
  } catch (error) {
    rethrowUnique(error, "plate", PLATE_IN_USE);
  }
}

export async function updateVehicle(ctx: ServiceContext, data: UpdateVehicleData): Promise<VehicleDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const { id, ...fields } = data;
  if (!(await db.vehicle.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  try {
    return await db.vehicle.update({ where: { id }, data: fields, select });
  } catch (error) {
    rethrowUnique(error, "plate", PLATE_IN_USE);
  }
}

export async function setVehicleActive(ctx: ServiceContext, id: string, active: boolean): Promise<VehicleDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.vehicle.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  return db.vehicle.update({ where: { id }, data: { active }, select });
}

export async function deleteVehicle(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.vehicle.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  try {
    await db.vehicle.delete({ where: { id } });
  } catch (error) {
    rethrowDeleteError(error);
  }
}
