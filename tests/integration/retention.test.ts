// Cron de retenção (seção 6) e a exigência da seção 9: recusar chamada sem CRON_SECRET.

import { beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/api/cron/retencao/route";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { runRetention } from "@/lib/services/retention";
import { statObject } from "@/lib/storage";
import { putObjectFromScript } from "@/lib/storage/admin";
import { buildProofFileKey } from "@/lib/storage/keys";
import { sampleSignaturePng } from "@/prisma/seed-support/png";

import { type CompanyFixture, cleanDatabase, createCompanyFixture } from "./fixtures";

const png = sampleSignaturePng(2);
const now = new Date("2026-11-20T06:00:00Z");
let a: CompanyFixture;
let b: CompanyFixture;

async function file(f: CompanyFixture, params: { status: "PENDING" | "CONFIRMED"; createdAt: Date; upload?: boolean }) {
  const key = buildProofFileKey({ companyId: f.companyId, orderId: f.order.id, contentType: "image/png" });
  if (params.upload !== false) await putObjectFromScript({ companyId: f.companyId, key, body: png, contentType: "image/png" });
  await prisma.fileObject.create({ data: { companyId: f.companyId, key, kind: "PHOTO", mimeType: "image/png", sizeBytes: png.byteLength, status: params.status, uploadedById: f.driver.id, createdAt: params.createdAt } });
  return key;
}

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
  await prisma.company.update({ where: { id: b.companyId }, data: { fileRetentionMonths: 36 } });
});

describe("cron de retenção", () => {
  it("recusa chamada sem CRON_SECRET ou com segredo errado, sem rodar nada", async () => {
    const before = await prisma.auditLog.count();
    for (const authorization of [undefined, "Bearer errado", `Bearer ${env.CRON_SECRET}x`, env.CRON_SECRET]) {
      const response = await GET(new Request("http://localhost/api/cron/retencao", { headers: authorization ? { authorization } : {} }));
      expect(response.status).toBe(401);
    }
    expect(await prisma.auditLog.count()).toBe(before);
  });

  it("apaga do storage e marca no banco o que passou da retenção de cada empresa; remove envios abandonados", async () => {
    const oldA = await file(a, { status: "CONFIRMED", createdAt: new Date("2025-10-01T00:00:00Z") });
    const recentA = await file(a, { status: "CONFIRMED", createdAt: new Date("2026-10-01T00:00:00Z") });
    const abandonedA = await file(a, { status: "PENDING", createdAt: new Date("2026-11-18T00:00:00Z"), upload: false });
    const freshPendingA = await file(a, { status: "PENDING", createdAt: new Date("2026-11-20T01:00:00Z") });
    // Empresa B guarda 36 meses: o mesmo arquivo de 2025 fica.
    const oldB = await file(b, { status: "CONFIRMED", createdAt: new Date("2025-10-01T00:00:00Z") });

    const report = await runRetention(now);
    expect(report).toMatchObject({ filesDeleted: 1, pendingRemoved: 1 });

    expect(await prisma.fileObject.findUniqueOrThrow({ where: { key: oldA } })).toMatchObject({ deletedAt: now });
    expect(await statObject({ companyId: a.companyId, key: oldA })).toBeNull();
    expect(await prisma.fileObject.findUniqueOrThrow({ where: { key: recentA } })).toMatchObject({ deletedAt: null });
    expect(await statObject({ companyId: a.companyId, key: recentA })).not.toBeNull();
    expect(await prisma.fileObject.findUnique({ where: { key: abandonedA } })).toBeNull();
    expect(await prisma.fileObject.findUnique({ where: { key: freshPendingA } })).not.toBeNull();
    expect(await prisma.fileObject.findUniqueOrThrow({ where: { key: oldB } })).toMatchObject({ deletedAt: null });
    expect(await statObject({ companyId: b.companyId, key: oldB })).not.toBeNull();

    expect(await prisma.auditLog.findFirstOrThrow({ where: { companyId: a.companyId, action: "RETENCAO_EXECUTADA" } })).toMatchObject({
      userId: null,
      after: { filesDeleted: 1, pendingRemoved: 1, retentionMonths: 12 },
    });
    expect(await prisma.auditLog.count({ where: { companyId: b.companyId, action: "RETENCAO_EXECUTADA" } })).toBe(0);

    // Rodar de novo no mesmo dia não faz nada.
    expect(await runRetention(now)).toMatchObject({ filesDeleted: 0, pendingRemoved: 0 });
  });

  it("com o segredo certo, roda e devolve só contagens (nada de chave de arquivo)", async () => {
    const response = await GET(new Request("http://localhost/api/cron/retencao", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, companies: 2, filesDeleted: 0, pendingRemoved: 0 });
    expect(JSON.stringify(body)).not.toContain("companies/");
  });
});
