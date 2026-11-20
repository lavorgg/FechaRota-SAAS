// Consulta da auditoria: só ADMIN, só da própria empresa, filtros por período e evento.

import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { listAuditLogs } from "@/lib/services/audit";
import { listAuditSchema } from "@/lib/validation/audit";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
  // O registro "TESTE" da fixture nasce com o relógio real; fica numa data fixa para o teste
  // não depender da hora em que roda.
  await prisma.auditLog.updateMany({ where: { action: "TESTE" }, data: { createdAt: new Date("2026-11-10T12:00:00Z") } });
  // 20/11 às 01:30 UTC ainda é 19/11 em São Paulo.
  await a.db.auditLog.createMany({
    data: [
      { companyId: a.companyId, userId: a.admin.id, entity: "Order", entityId: a.order.id, action: "PEDIDO_CANCELADO", before: { status: "PENDENTE" }, after: { status: "CANCELADO" }, reason: "Cliente desistiu", createdAt: new Date("2026-11-20T01:30:00Z") },
      { companyId: a.companyId, userId: null, entity: "FileObject", entityId: a.companyId, action: "RETENCAO_EXECUTADA", after: { filesDeleted: 3, pendingRemoved: 0 }, createdAt: new Date("2026-11-20T06:00:00Z") },
      { companyId: a.companyId, userId: a.admin.id, entity: "User", entityId: a.driver.id, action: "USUARIO_ALTERADO", before: { passwordHash: "segredo", name: "Velho" }, after: { passwordHash: "outro", name: "Novo" }, createdAt: new Date("2026-11-18T12:00:00Z") },
    ],
  });
});

const filters = (input: Record<string, unknown> = {}) => listAuditSchema.parse(input);

describe("auditoria", () => {
  it("só ADMIN consulta", async () => {
    const expedicao = { id: a.admin.id, companyId: a.companyId, role: "EXPEDICAO" as const };
    for (const ctx of [contextOf(expedicao), contextOf(a.driver)]) {
      const error = await listAuditLogs(ctx, filters()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).code).toBe("SEM_PERMISSAO");
    }
  });

  it("lista só a própria empresa, do mais recente para o mais antigo, com nomes legíveis e sem segredo", async () => {
    const page = await listAuditLogs(contextOf(a.admin), filters());
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.actionLabel)).toEqual(["Arquivos apagados pela retenção", "Pedido cancelado", "Usuário alterado", "TESTE"]);
    expect(page.items[0]).toMatchObject({ userName: "Sistema", subject: "Arquivos de comprovante", changes: [{ field: "Arquivos apagados", before: "—", after: "3" }, { field: "Envios abandonados removidos", before: "—", after: "0" }] });
    expect(page.items[1]).toMatchObject({ userName: "Admin A", subject: "Pedido nº 1 · Cliente A", reason: "Cliente desistiu", changes: [{ field: "Situação", before: "Pendente", after: "Cancelado" }] });
    expect(page.items[2]?.changes).toEqual([{ field: "Nome", before: "Velho", after: "Novo" }]);
    expect(JSON.stringify(page)).not.toContain("segredo");
    expect((await listAuditLogs(contextOf(b.admin), filters())).total).toBe(1);
  });

  it("filtra por evento e por dia no fuso da empresa", async () => {
    expect((await listAuditLogs(contextOf(a.admin), filters({ tipo: "PEDIDO_CANCELADO" }))).items.map((item) => item.action)).toEqual(["PEDIDO_CANCELADO"]);
    // O cancelamento foi às 22:30 de 19/11 em São Paulo.
    expect((await listAuditLogs(contextOf(a.admin), filters({ de: "2026-11-19", ate: "2026-11-19" }))).items.map((item) => item.action)).toEqual(["PEDIDO_CANCELADO"]);
    expect((await listAuditLogs(contextOf(a.admin), filters({ de: "2026-11-20" }))).items.map((item) => item.action)).toContain("RETENCAO_EXECUTADA");
    expect((await listAuditLogs(contextOf(a.admin), filters({ tipo: "x'; DROP" }))).total).toBe(4);
    expect(await prisma.auditLog.count()).toBe(5);
  });
});
