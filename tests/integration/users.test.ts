// Gestão de usuários (seção 5.1): papéis, isolamento entre empresas, último ADMIN,
// sessões encerradas e auditoria.

import { beforeAll, describe, expect, it } from "vitest";

import { createSession, findValidSession } from "@/lib/auth/sessions";
import { prisma } from "@/lib/db";
import { MESSAGES, ServiceError } from "@/lib/errors";
import { USER_MESSAGES, createUser, listUsers, resetUserPassword, setUserActive, updateUser } from "@/lib/services/users";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;
let expedicaoA: { id: string; companyId: string; role: "EXPEDICAO" };

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
  const user = await prisma.user.create({ data: { companyId: a.companyId, name: "Expedição A", email: "exp-a@teste.local", role: "EXPEDICAO", passwordHash: "x" } });
  expedicaoA = { id: user.id, companyId: a.companyId, role: "EXPEDICAO" };
});

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

const newUser = (email: string, role: "ADMIN" | "EXPEDICAO" | "MOTORISTA" = "MOTORISTA") => ({ name: "Novo", email, phone: null, role, password: "senha-inicial" });

describe("permissão por papel", () => {
  it.each(["EXPEDICAO", "MOTORISTA"] as const)("%s não lista, não cria, não edita e não redefine senha", async (role) => {
    const actor = role === "EXPEDICAO" ? expedicaoA : { ...a.driver, role: "MOTORISTA" as const };
    const ctx = contextOf(actor);
    expect((await rejection(listUsers(ctx, { page: 1 }))).message).toBe(MESSAGES.forbidden);
    expect((await rejection(createUser(ctx, newUser(`x-${role}@teste.local`)))).code).toBe("SEM_PERMISSAO");
    expect((await rejection(updateUser(ctx, { id: a.driver.id, name: "x", email: a.driver.email, phone: null, role: "ADMIN" }))).code).toBe("SEM_PERMISSAO");
    expect((await rejection(setUserActive(ctx, { id: a.driver.id, active: false }))).code).toBe("SEM_PERMISSAO");
    expect((await rejection(resetUserPassword(ctx, { id: a.driver.id, password: "outra-senha" }))).code).toBe("SEM_PERMISSAO");
    expect(await prisma.user.count({ where: { email: `x-${role}@teste.local` } })).toBe(0);
  });

  it("ADMIN lista só os usuários da própria empresa", async () => {
    const result = await listUsers(contextOf(a.admin), { page: 1 });
    expect(result.items.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(result.items.map((u) => u.id));
    expect(ids.has(b.admin.id)).toBe(false);
    expect(ids.has(b.driver.id)).toBe(false);
    expect(result.items[0]).not.toHaveProperty("passwordHash");
  });

  it("busca por nome (sem diferenciar maiúsculas) e por e-mail", async () => {
    expect((await listUsers(contextOf(a.admin), { page: 1, q: "EXPEDIÇÃO" })).items.map((u) => u.id)).toEqual([expedicaoA.id]);
    expect((await listUsers(contextOf(a.admin), { page: 1, q: "EXP-A@" })).items.map((u) => u.id)).toEqual([expedicaoA.id]);
  });
});

describe("criar usuário", () => {
  it("ADMIN cria qualquer papel, inclusive outro ADMIN, com auditoria", async () => {
    const created = await createUser(contextOf(a.admin), newUser("segundo-admin@teste.local", "ADMIN"));
    expect(created).toMatchObject({ role: "ADMIN", active: true, email: "segundo-admin@teste.local" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: created.id, action: "USUARIO_CRIADO" } });
    expect(audit).toMatchObject({ companyId: a.companyId, userId: a.admin.id });
    expect(JSON.stringify(audit.after)).not.toContain("senha-inicial");
  });

  it("e-mail já usado, mesmo em outra empresa, é erro de campo", async () => {
    const error = await rejection(createUser(contextOf(a.admin), newUser(b.admin.email)));
    expect(error.fieldErrors).toEqual({ email: "Este e-mail já está em uso." });
  });

  it("plano em atraso ou cancelado: somente leitura", async () => {
    for (const plan of ["PAST_DUE", "CANCELED"] as const) {
      const error = await rejection(createUser(contextOf(a.admin, plan), newUser(`bloqueado-${plan}@teste.local`)));
      expect(error).toMatchObject({ code: "SOMENTE_LEITURA", message: MESSAGES.readOnly });
    }
    // Consultar continua liberado.
    await expect(listUsers(contextOf(a.admin, "PAST_DUE"), { page: 1 })).resolves.toBeTruthy();
  });
});

describe("isolamento entre empresas", () => {
  it("ADMIN da B não edita, não desativa e não redefine senha de usuário da A (404)", async () => {
    const ctx = contextOf(b.admin);
    expect((await rejection(updateUser(ctx, { id: a.driver.id, name: "invadido", email: a.driver.email, phone: null, role: "ADMIN" }))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(setUserActive(ctx, { id: a.driver.id, active: false }))).code).toBe("NAO_ENCONTRADO");
    expect((await rejection(resetUserPassword(ctx, { id: a.driver.id, password: "senha-invasora" }))).code).toBe("NAO_ENCONTRADO");
    const driver = await prisma.user.findUniqueOrThrow({ where: { id: a.driver.id } });
    expect(driver).toMatchObject({ name: a.driver.name, role: "MOTORISTA", active: true });
  });
});

describe("último ADMIN e alterações em si mesmo", () => {
  it("ninguém muda o próprio papel nem se desativa", async () => {
    const ctx = contextOf(b.admin);
    expect((await rejection(updateUser(ctx, { id: b.admin.id, name: "B", email: b.admin.email, phone: null, role: "EXPEDICAO" }))).message).toBe(USER_MESSAGES.ownRole);
    expect((await rejection(setUserActive(ctx, { id: b.admin.id, active: false }))).message).toBe(USER_MESSAGES.ownDeactivation);
    // Editar os próprios dados sem mudar o papel é permitido.
    await expect(updateUser(ctx, { id: b.admin.id, name: "Admin B renomeado", email: b.admin.email, phone: "5516999990009", role: "ADMIN" })).resolves.toMatchObject({ name: "Admin B renomeado" });
  });

  it("ADMIN rebaixa e desativa outro ADMIN quando sobra pelo menos um", async () => {
    const company = await createCompanyFixture("C");
    const second = await createUser(contextOf(company.admin), newUser("admin2-c@teste.local", "ADMIN"));
    await updateUser(contextOf(company.admin), { id: second.id, name: second.name, email: second.email, phone: null, role: "EXPEDICAO" });
    await updateUser(contextOf(company.admin), { id: second.id, name: second.name, email: second.email, phone: null, role: "ADMIN" });
    await setUserActive(contextOf(company.admin), { id: second.id, active: false });
    expect(await prisma.user.count({ where: { companyId: company.companyId, role: "ADMIN", active: true } })).toBe(1);
  });

  it("o último ADMIN ativo não pode ser rebaixado nem desativado, nem por quem perdeu o papel no meio do caminho", async () => {
    // Só dá para chegar aqui por corrida: o único ADMIN é sempre quem age, e mudar o próprio
    // papel já é bloqueado. Simula quem agiu com uma sessão de ADMIN que acabou de ser rebaixado.
    const company = await createCompanyFixture("E");
    const second = await createUser(contextOf(company.admin), newUser("admin2-e@teste.local", "ADMIN"));
    const staleFirst = contextOf(company.admin);
    await updateUser(contextOf({ id: second.id, companyId: company.companyId, role: "ADMIN" }), {
      id: company.admin.id,
      name: company.admin.name,
      email: company.admin.email,
      phone: null,
      role: "EXPEDICAO",
    });

    const demote = await rejection(updateUser(staleFirst, { id: second.id, name: second.name, email: second.email, phone: null, role: "MOTORISTA" }));
    expect(demote.message).toBe(USER_MESSAGES.lastAdmin);
    const deactivate = await rejection(setUserActive(staleFirst, { id: second.id, active: false }));
    expect(deactivate.message).toBe(USER_MESSAGES.lastAdmin);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ role: "ADMIN", active: true });
  });

  it("duas trocas simultâneas não deixam a empresa sem ADMIN", async () => {
    const company = await createCompanyFixture("D");
    const second = await createUser(contextOf(company.admin), newUser("admin2-d@teste.local", "ADMIN"));
    const ctx1 = contextOf(company.admin);
    const ctx2 = contextOf({ id: second.id, companyId: company.companyId, role: "ADMIN" });
    // Cada um rebaixa o outro ao mesmo tempo.
    const results = await Promise.allSettled([
      updateUser(ctx1, { id: second.id, name: second.name, email: second.email, phone: null, role: "EXPEDICAO" }),
      updateUser(ctx2, { id: company.admin.id, name: company.admin.name, email: company.admin.email, phone: null, role: "EXPEDICAO" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.user.count({ where: { companyId: company.companyId, role: "ADMIN", active: true } })).toBe(1);
  });
});

describe("sessões e auditoria", () => {
  it("trocar o papel encerra as sessões do usuário e fica na auditoria", async () => {
    const user = await createUser(contextOf(a.admin), newUser("troca-papel@teste.local", "MOTORISTA"));
    const { token } = await createSession({ userId: user.id, role: "MOTORISTA", userAgent: null });
    await updateUser(contextOf(a.admin), { id: user.id, name: user.name, email: user.email, phone: null, role: "EXPEDICAO" });
    expect(await findValidSession(token)).toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: "USUARIO_PAPEL_ALTERADO" } });
    expect(audit.before).toEqual({ role: "MOTORISTA" });
    expect(audit.after).toEqual({ role: "EXPEDICAO" });
  });

  it("editar só o nome não encerra sessões", async () => {
    const user = await createUser(contextOf(a.admin), newUser("so-nome@teste.local"));
    const { token } = await createSession({ userId: user.id, role: "MOTORISTA", userAgent: null });
    await updateUser(contextOf(a.admin), { id: user.id, name: "Nome Novo", email: user.email, phone: null, role: "MOTORISTA" });
    expect(await findValidSession(token)).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "USUARIO_ALTERADO" } })).toBe(1);
  });

  it("desativar encerra sessões; reativar não recria", async () => {
    const user = await createUser(contextOf(a.admin), newUser("desativar@teste.local"));
    const { token } = await createSession({ userId: user.id, role: "MOTORISTA", userAgent: null });
    await setUserActive(contextOf(a.admin), { id: user.id, active: false });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await setUserActive(contextOf(a.admin), { id: user.id, active: true });
    expect(await findValidSession(token)).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: { in: ["USUARIO_DESATIVADO", "USUARIO_REATIVADO"] } } })).toBe(2);
  });

  it("nova senha encerra sessões, troca o hash e não grava a senha na auditoria", async () => {
    const user = await createUser(contextOf(a.admin), newUser("nova-senha@teste.local"));
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, omit: { passwordHash: false } });
    const { token } = await createSession({ userId: user.id, role: "MOTORISTA", userAgent: null });
    await resetUserPassword(contextOf(a.admin), { id: user.id, password: "senha-trocada-9" });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, omit: { passwordHash: false } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await findValidSession(token)).toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: "USUARIO_SENHA_REDEFINIDA" } });
    expect(JSON.stringify(audit)).not.toContain("senha-trocada-9");
  });
});
