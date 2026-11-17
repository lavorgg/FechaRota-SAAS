import { describe, expect, it } from "vitest";

import { isImpersonationEnabled } from "./impersonation-flag";

describe("troca de perfil (só desenvolvimento)", () => {
  it("liga somente com NODE_ENV=development, flag ligada e fora da Vercel", () => {
    expect(isImpersonationEnabled({ NODE_ENV: "development", VERCEL_ENV: undefined, ENABLE_DEV_IMPERSONATION: true })).toBe(true);
  });

  it.each([
    ["flag desligada", { NODE_ENV: "development", VERCEL_ENV: undefined, ENABLE_DEV_IMPERSONATION: false }],
    ["produção na Vercel", { NODE_ENV: "production", VERCEL_ENV: "production", ENABLE_DEV_IMPERSONATION: true }],
    ["preview na Vercel", { NODE_ENV: "production", VERCEL_ENV: "preview", ENABLE_DEV_IMPERSONATION: true }],
    ["build de produção local", { NODE_ENV: "production", VERCEL_ENV: undefined, ENABLE_DEV_IMPERSONATION: true }],
    ["testes", { NODE_ENV: "test", VERCEL_ENV: undefined, ENABLE_DEV_IMPERSONATION: true }],
    ["vercel dev", { NODE_ENV: "development", VERCEL_ENV: "development", ENABLE_DEV_IMPERSONATION: true }],
  ] as const)("desligada em: %s", (_label, source) => {
    expect(isImpersonationEnabled(source)).toBe(false);
  });
});
