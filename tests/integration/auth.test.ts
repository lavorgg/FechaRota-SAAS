// Login, sessões e cadastro de empresa (seção 5.1) contra o Postgres de teste.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { LOGIN_MESSAGES, authenticate, type LoginLimiters } from "@/lib/auth/login";
import { hashPassword } from "@/lib/auth/password";
import { hashSessionToken } from "@/lib/auth/session-token";
import { createSession, deleteSessionByToken, deleteSessionsOfUser, findValidSession } from "@/lib/auth/sessions";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { MemoryRateLimiter } from "@/lib/rate-limit/memory";
import { EMAIL_IN_USE, signupCompany } from "@/lib/services/signup";

import { type CompanyFixture, cleanDatabase, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
const PASSWORD = "senha-certa-123";
let email = "";

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  email = a.admin.email;
  await prisma.user.update({ where: { id: a.admin.id }, data: { passwordHash: await hashPassword(PASSWORD) } });
});

function limiters(max = { email: 10, ip: 100 }): LoginLimiters {
  return {
    byEmail: new MemoryRateLimiter({ name: "e", max: max.email, windowMs: 15 * 60_000 }),
    byIp: new MemoryRateLimiter({ name: "i", max: max.ip, windowMs: 15 * 60_000 }),
  };
}

describe("authenticate", () => {
  it("aceita e-mail e senha corretos", async () => {
    const result = await authenticate({ email, password: PASSWORD, ip: "1.1.1.1" }, limiters());
    expect(result).toEqual({ ok: true, user: { id: a.admin.id, role: "ADMIN", companyId: a.companyId } });
  });

  it("senha errada e e-mail inexistente dão a MESMA mensagem", async () => {
    const wrong = await authenticate({ email, password: "senha-errada", ip: "1.1.1.1" }, limiters());
    const unknown = await authenticate({ email: "ninguem@teste.local", password: PASSWORD, ip: "1.1.1.1" }, limiters());
    expect(wrong).toEqual({ ok: false, error: LOGIN_MESSAGES.invalid });
    expect(unknown).toEqual({ ok: false, error: LOGIN_MESSAGES.invalid });
  });

  it("usuário desativado não entra (e só descobre isso quem sabe a senha)", async () => {
    const user = await prisma.user.create({
      data: { companyId: a.companyId, name: "Inativo", email: "inativo@teste.local", role: "MOTORISTA", active: false, passwordHash: await hashPassword(PASSWORD) },
    });
    expect(await authenticate({ email: user.email, password: PASSWORD, ip: "1.1.1.1" }, limiters())).toEqual({ ok: false, error: LOGIN_MESSAGES.inactive });
    expect(await authenticate({ email: user.email, password: "errada-123", ip: "1.1.1.1" }, limiters())).toEqual({ ok: false, error: LOGIN_MESSAGES.invalid });
  });

  it("bloqueia depois de 10 tentativas do mesmo e-mail no mesmo IP, mesmo com a senha certa", async () => {
    const l = limiters();
    for (let i = 0; i < 10; i++) {
      expect((await authenticate({ email, password: "errada", ip: "2.2.2.2" }, l)).ok).toBe(false);
    }
    const blocked = await authenticate({ email, password: PASSWORD, ip: "2.2.2.2" }, l);
    expect(blocked).toEqual({ ok: false, error: LOGIN_MESSAGES.tooManyAttempts(15) });
    // Outro IP continua podendo entrar.
    expect((await authenticate({ email, password: PASSWORD, ip: "3.3.3.3" }, l)).ok).toBe(true);
  });

  it("login certo zera a contagem do e-mail naquele IP", async () => {
    const l = limiters();
    for (let i = 0; i < 9; i++) await authenticate({ email, password: "errada", ip: "4.4.4.4" }, l);
    expect((await authenticate({ email, password: PASSWORD, ip: "4.4.4.4" }, l)).ok).toBe(true);
    for (let i = 0; i < 9; i++) {
      expect(await authenticate({ email, password: "errada", ip: "4.4.4.4" }, l)).toEqual({ ok: false, error: LOGIN_MESSAGES.invalid });
    }
  });

  it("limite por IP barra o teste de muitas contas a partir do mesmo endereço", async () => {
    const l = limiters({ email: 10, ip: 5 });
    for (let i = 0; i < 5; i++) await authenticate({ email: `conta${i}@teste.local`, password: "x", ip: "5.5.5.5" }, l);
    const result = await authenticate({ email, password: PASSWORD, ip: "5.5.5.5" }, l);
    expect(result.ok).toBe(false);
  });
});

describe("sessões", () => {
  it("o banco guarda só o hash do token", async () => {
    const { token } = await createSession({ userId: a.admin.id, role: "ADMIN", userAgent: "teste" });
    const stored = await prisma.session.findFirstOrThrow({ where: { userId: a.admin.id }, orderBy: { createdAt: "desc" }, omit: { tokenHash: false } });
    expect(stored.tokenHash).toBe(hashSessionToken(token));
    expect(stored.tokenHash).not.toBe(token);
  });

  it("sessão válida devolve usuário e empresa lidos do banco", async () => {
    const { token } = await createSession({ userId: a.driver.id, role: "MOTORISTA", userAgent: null });
    const session = await findValidSession(token);
    expect(session?.user).toEqual({ id: a.driver.id, name: a.driver.name, email: a.driver.email, role: "MOTORISTA", companyId: a.companyId });
    expect(session?.company).toMatchObject({ id: a.companyId, timezone: "America/Sao_Paulo", planStatus: "TRIAL" });
  });

  it("motorista: 30 dias; painel: 12 horas", async () => {
    const now = new Date();
    const driver = await createSession({ userId: a.driver.id, role: "MOTORISTA", userAgent: null, now });
    const admin = await createSession({ userId: a.admin.id, role: "ADMIN", userAgent: null, now });
    expect(driver.expiresAt.getTime() - now.getTime()).toBe(30 * 24 * 3600_000);
    expect(admin.expiresAt.getTime() - now.getTime()).toBe(12 * 3600_000);
  });

  it("sessão vencida é recusada e apagada", async () => {
    const past = new Date(Date.now() - 13 * 3600_000);
    const { token } = await createSession({ userId: a.admin.id, role: "ADMIN", userAgent: null, now: past });
    expect(await findValidSession(token)).toBeNull();
    expect(await prisma.session.count({ where: { tokenHash: hashSessionToken(token) } })).toBe(0);
  });

  it("desativar o usuário derruba a sessão na próxima requisição; mudar o papel vale na hora", async () => {
    const user = await prisma.user.create({ data: { companyId: a.companyId, name: "Temp", email: "temp@teste.local", role: "EXPEDICAO", passwordHash: "x" } });
    const { token } = await createSession({ userId: user.id, role: "EXPEDICAO", userAgent: null });
    await prisma.user.update({ where: { id: user.id }, data: { role: "MOTORISTA" } });
    expect((await findValidSession(token))?.user.role).toBe("MOTORISTA");
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await findValidSession(token)).toBeNull();
  });

  it("token desconhecido ou malformado não encontra nada", async () => {
    expect(await findValidSession("x".repeat(43))).toBeNull();
    expect(await findValidSession("malformado")).toBeNull();
    expect(await findValidSession("")).toBeNull();
  });

  it("logout apaga a sessão; deleteSessionsOfUser apaga todas", async () => {
    const one = await createSession({ userId: a.driver.id, role: "MOTORISTA", userAgent: null });
    await deleteSessionByToken(one.token);
    expect(await findValidSession(one.token)).toBeNull();

    const s1 = await createSession({ userId: a.driver.id, role: "MOTORISTA", userAgent: null });
    const s2 = await createSession({ userId: a.driver.id, role: "MOTORISTA", userAgent: null });
    expect(await deleteSessionsOfUser(a.driver.id)).toBeGreaterThanOrEqual(2);
    expect(await findValidSession(s1.token)).toBeNull();
    expect(await findValidSession(s2.token)).toBeNull();
  });
});

describe("cadastro de empresa", () => {
  const data = {
    companyName: "Distribuidora Nova",
    cnpj: "11222333000181",
    timezone: "America/Manaus",
    adminName: "Nina Nova",
    email: "nina@nova.test",
    password: "senha-nova-123",
    passwordConfirmation: "senha-nova-123",
  };

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "entity" = 'Company'`);
  });

  it("cria empresa em TRIAL por 14 dias, contadores e o ADMIN", async () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const { userId, companyId } = await signupCompany(data, now);

    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { counters: true, users: { omit: { passwordHash: false } } } });
    expect(company).toMatchObject({ name: "Distribuidora Nova", cnpj: "11222333000181", timezone: "America/Manaus", planStatus: "TRIAL" });
    expect(company.trialEndsAt.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(company.counters.map((c) => c.key).sort()).toEqual(["order", "route"]);
    expect(company.users).toHaveLength(1);
    expect(company.users[0]).toMatchObject({ id: userId, role: "ADMIN", email: "nina@nova.test", active: true });
    expect(company.users[0]?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await prisma.auditLog.count({ where: { companyId, action: "EMPRESA_CADASTRADA" } })).toBe(1);

    const login = await authenticate({ email: "nina@nova.test", password: "senha-nova-123", ip: "9.9.9.9" }, limiters());
    expect(login.ok).toBe(true);
  });

  it("e-mail já usado (em qualquer empresa) é recusado sem criar nada", async () => {
    const before = await prisma.company.count();
    const error = await signupCompany({ ...data, email }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).fieldErrors).toEqual({ email: EMAIL_IN_USE });
    expect(await prisma.company.count()).toBe(before);
  });

  it("o banco recusa e-mail fora do formato normalizado", async () => {
    await expect(
      prisma.user.create({ data: { companyId: a.companyId, name: "X", email: "Maiusculo@Teste.local", role: "ADMIN", passwordHash: "x" } }),
    ).rejects.toThrow();
  });
});
