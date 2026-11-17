// Troca rápida de perfil (seção 5.1): inalcançável fora do desenvolvimento.

import { beforeAll, describe, expect, it } from "vitest";

import { impersonate, isImpersonationEnabled, listImpersonationTargets } from "@/lib/auth/impersonation";
import { createSession, findValidSession } from "@/lib/auth/sessions";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

const DEV = { NODE_ENV: "development", VERCEL_ENV: undefined, ENABLE_DEV_IMPERSONATION: true } as const;
const PRODUCTION = { NODE_ENV: "production", VERCEL_ENV: "production", ENABLE_DEV_IMPERSONATION: true } as const;
const PREVIEW = { NODE_ENV: "production", VERCEL_ENV: "preview", ENABLE_DEV_IMPERSONATION: true } as const;

let a: CompanyFixture;
let b: CompanyFixture;

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
});

async function adminContextWithSession() {
  const { token } = await createSession({ userId: a.admin.id, role: "ADMIN", userAgent: null });
  const session = await findValidSession(token);
  if (!session) throw new Error("sessão não criada");
  return { ctx: { ...contextOf(a.admin), sessionId: session.sessionId }, token };
}

describe("troca de perfil", () => {
  it("está desligada no ambiente dos testes", () => {
    expect(env.NODE_ENV).toBe("test");
    expect(isImpersonationEnabled()).toBe(false);
  });

  it.each([
    ["produção", PRODUCTION],
    ["preview", PREVIEW],
    ["o próprio ambiente (padrão)", undefined],
  ])("é recusada em %s, sem criar sessão", async (_label, source) => {
    const { ctx, token } = await adminContextWithSession();
    const before = await prisma.session.count();
    await expect(impersonate(ctx, a.driver.id, null, source)).rejects.toBeInstanceOf(ServiceError);
    await expect(listImpersonationTargets(ctx, source)).rejects.toBeInstanceOf(ServiceError);
    expect(await prisma.session.count()).toBe(before);
    expect(await findValidSession(token)).not.toBeNull();
  });

  it("em desenvolvimento troca para outro usuário da mesma empresa e encerra a sessão anterior", async () => {
    const { ctx, token } = await adminContextWithSession();
    const targets = await listImpersonationTargets(ctx, DEV);
    expect(targets.map((t) => t.id).sort()).toEqual([a.admin.id, a.driver.id].sort());

    const next = await impersonate(ctx, a.driver.id, "teste", DEV);
    expect(next.role).toBe("MOTORISTA");
    expect((await findValidSession(next.token))?.user.id).toBe(a.driver.id);
    expect(await findValidSession(token)).toBeNull();
  });

  it("nunca troca para usuário de outra empresa, nem em desenvolvimento", async () => {
    const { ctx, token } = await adminContextWithSession();
    const error = await impersonate(ctx, b.admin.id, null, DEV).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "NAO_ENCONTRADO" });
    expect(await findValidSession(token)).not.toBeNull();
  });

  it("nunca troca para usuário desativado", async () => {
    const inactive = await prisma.user.create({ data: { companyId: a.companyId, name: "Inativo", email: "inativo-dev@teste.local", role: "MOTORISTA", active: false, passwordHash: "x" } });
    const { ctx } = await adminContextWithSession();
    await expect(impersonate(ctx, inactive.id, null, DEV)).rejects.toMatchObject({ code: "NAO_ENCONTRADO" });
  });
});
