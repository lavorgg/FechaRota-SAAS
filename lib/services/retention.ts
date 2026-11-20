// Retenção de arquivos (seção 6), rodada pelo Vercel Cron todo dia:
// - fotos e assinaturas mais antigas que Company.fileRetentionMonths: apagadas do storage e
//   marcadas no banco (FileObject.deletedAt); o comprovante continua, sem os arquivos;
// - envios abandonados (FileObject PENDING com mais de 24 horas): apagados do storage e do banco.
//
// Cada empresa é tratada com o client por empresa; o lote por rodada cabe no tempo de uma
// função serverless, e o que sobrar vai na rodada seguinte.

import "server-only";

import { retentionCutoff } from "../../domain/retention";
import { prisma } from "../db";
import { deleteObjects } from "../storage";
import { getTenantDb } from "../tenant-db";

export const RETENTION_BATCH = 500;
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RetentionReport = { companies: number; filesDeleted: number; pendingRemoved: number };

export async function runRetention(now: Date = new Date(), batch = RETENTION_BATCH): Promise<RetentionReport> {
  const companies = await prisma.company.findMany({ select: { id: true, fileRetentionMonths: true }, orderBy: { id: "asc" } });
  const report: RetentionReport = { companies: companies.length, filesDeleted: 0, pendingRemoved: 0 };

  for (const company of companies) {
    const db = getTenantDb({ companyId: company.id });
    const cutoff = retentionCutoff(now, company.fileRetentionMonths);
    const expired = await db.fileObject.findMany({
      where: { status: "CONFIRMED", deletedAt: null, createdAt: { lt: cutoff } },
      select: { key: true },
      orderBy: { createdAt: "asc" },
      take: batch,
    });
    const abandoned = await db.fileObject.findMany({
      where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - PENDING_MAX_AGE_MS) } },
      select: { key: true },
      orderBy: { createdAt: "asc" },
      take: batch,
    });
    if (expired.length === 0 && abandoned.length === 0) continue;

    // Primeiro o storage, depois o banco: se o storage falhar, a próxima rodada tenta de novo.
    const expiredKeys = expired.map((file) => file.key);
    const abandonedKeys = abandoned.map((file) => file.key);
    await deleteObjects({ companyId: company.id, keys: [...expiredKeys, ...abandonedKeys] });
    await db.$transaction(async (tx) => {
      if (expiredKeys.length > 0) await tx.fileObject.updateMany({ where: { key: { in: expiredKeys }, deletedAt: null }, data: { deletedAt: now } });
      if (abandonedKeys.length > 0) await tx.fileObject.deleteMany({ where: { key: { in: abandonedKeys }, status: "PENDING" } });
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: null,
          entity: "FileObject",
          entityId: company.id,
          action: "RETENCAO_EXECUTADA",
          after: { filesDeleted: expiredKeys.length, pendingRemoved: abandonedKeys.length, retentionMonths: company.fileRetentionMonths },
        },
      });
    });
    report.filesDeleted += expiredKeys.length;
    report.pendingRemoved += abandonedKeys.length;
  }
  return report;
}
