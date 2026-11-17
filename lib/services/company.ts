// Configurações da empresa: dados básicos e endereço do depósito (ponto de partida do link
// do Google Maps; decisão do dono do produto). Só ADMIN ("usuários e configurações").

import "server-only";

import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { getTenantDb } from "../tenant-db";
import type { CompanySettingsData } from "../validation/routes";

const select = {
  name: true,
  cnpj: true,
  phone: true,
  timezone: true,
  depotZipCode: true,
  depotStreet: true,
  depotNumber: true,
  depotComplement: true,
  depotNeighborhood: true,
  depotCity: true,
  depotState: true,
  depotLatitude: true,
  depotLongitude: true,
} as const;

export type CompanySettingsDTO = {
  name: string;
  cnpj: string | null;
  phone: string | null;
  timezone: string;
  depotZipCode: string | null;
  depotStreet: string | null;
  depotNumber: string | null;
  depotComplement: string | null;
  depotNeighborhood: string | null;
  depotCity: string | null;
  depotState: string | null;
  depotLatitude: number | null;
  depotLongitude: number | null;
};

export async function getCompanySettings(ctx: ServiceContext): Promise<CompanySettingsDTO> {
  assertCan(ctx, "usuarios.gerenciar");
  return getTenantDb(ctx).company.findUniqueOrThrow({ where: { id: ctx.companyId }, select });
}

export async function updateCompanySettings(ctx: ServiceContext, data: CompanySettingsData): Promise<CompanySettingsDTO> {
  assertCan(ctx, "usuarios.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  return db.$transaction(async (tx) => {
    const before = await tx.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select });
    const after = await tx.company.update({ where: { id: ctx.companyId }, data, select });
    await tx.auditLog.create({
      data: { companyId: ctx.companyId, userId: ctx.userId, entity: "Company", entityId: ctx.companyId, action: "EMPRESA_ALTERADA", before, after },
    });
    return after;
  });
}
