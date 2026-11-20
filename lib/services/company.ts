// Configurações da empresa (só ADMIN: "usuários e configurações"): dados básicos, fuso, política
// de comprovante, retenção de arquivos e endereço do depósito (partida do link do Google Maps).
// Decisões do dono do produto: retenção de 3 a 60 meses; mudar a política de comprovante vale para
// as rotas iniciadas depois (a rota guarda a política no "Iniciar rota").

import "server-only";

import type { ProofPolicy } from "../../domain/delivery";
import { RETENTION_MONTHS_MAX, RETENTION_MONTHS_MIN, retentionCutoff } from "../../domain/retention";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { ServiceError } from "../errors";
import { getTenantDb } from "../tenant-db";
import type { CompanySettingsData } from "../validation/routes";

const select = {
  name: true,
  cnpj: true,
  phone: true,
  timezone: true,
  proofPolicy: true,
  fileRetentionMonths: true,
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
  proofPolicy: ProofPolicy;
  fileRetentionMonths: number;
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

/**
 * Quantos arquivos o cron apagaria na próxima rodada com a retenção informada. A tela mostra
 * antes de salvar uma retenção menor (decisão do dono do produto).
 */
export async function countFilesBeyondRetention(ctx: ServiceContext, months: number, now: Date = new Date()): Promise<number> {
  assertCan(ctx, "usuarios.gerenciar");
  if (!Number.isInteger(months) || months < RETENTION_MONTHS_MIN || months > RETENTION_MONTHS_MAX) {
    throw new ServiceError("VALIDACAO", `A retenção deve ficar entre ${RETENTION_MONTHS_MIN} e ${RETENTION_MONTHS_MAX} meses.`);
  }
  return getTenantDb(ctx).fileObject.count({ where: { status: "CONFIRMED", deletedAt: null, createdAt: { lt: retentionCutoff(now, months) } } });
}
