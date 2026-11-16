import { describe, expect, it } from "vitest";

import { InvalidEnvError, parseEnv } from "./env-schema";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  DIRECT_URL: "postgresql://u:p@localhost:5432/db",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_BUCKET: "bucket",
  S3_FORCE_PATH_STYLE: "true",
  CRON_SECRET: "x".repeat(32),
} satisfies Record<string, string>;

function problemsOf(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
    return [];
  } catch (error) {
    if (error instanceof InvalidEnvError) return error.problems.map((p) => p.name);
    throw error;
  }
}

describe("parseEnv", () => {
  it("aceita a configuração local do .env.example", () => {
    const env = parseEnv({ ...valid, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.ENABLE_DEV_IMPERSONATION).toBe(false);
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.VERCEL_ENV).toBeUndefined();
  });

  it("lista TODAS as variáveis que faltam, pelo nome", () => {
    expect(problemsOf({})).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "DIRECT_URL",
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_BUCKET",
        "CRON_SECRET",
      ]),
    );
  });

  it("a mensagem de erro nunca contém o valor da variável", () => {
    const secret = "postgresql://usuario:SENHA-SUPER-SECRETA@host/db";
    try {
      parseEnv({ ...valid, DATABASE_URL: secret, CRON_SECRET: "curto-demais-SEGREDO" });
      expect.unreachable("deveria ter falhado");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      const message = (error as Error).message;
      expect(message).toContain("CRON_SECRET");
      expect(message).not.toContain("SENHA-SUPER-SECRETA");
      expect(message).not.toContain("curto-demais-SEGREDO");
    }
  });

  it("rejeita URL de banco que não é Postgres", () => {
    expect(problemsOf({ ...valid, DATABASE_URL: "file:./dev.db" })).toEqual(["DATABASE_URL"]);
    expect(problemsOf({ ...valid, DIRECT_URL: "mysql://u:p@h/db" })).toEqual(["DIRECT_URL"]);
  });

  it("CRON_SECRET precisa de 32 caracteres", () => {
    expect(problemsOf({ ...valid, CRON_SECRET: "x".repeat(31) })).toEqual(["CRON_SECRET"]);
  });

  describe("Upstash", () => {
    it("é opcional em desenvolvimento e em teste", () => {
      expect(problemsOf({ ...valid, NODE_ENV: "development" })).toEqual([]);
      expect(problemsOf({ ...valid, NODE_ENV: "test" })).toEqual([]);
    });

    it("é obrigatório em produção (inclusive preview da Vercel)", () => {
      expect(problemsOf({ ...valid, NODE_ENV: "production" })).toEqual([
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
      ]);
      expect(problemsOf({ ...valid, NODE_ENV: "production", VERCEL_ENV: "preview" })).toEqual([
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
      ]);
      expect(
        problemsOf({
          ...valid,
          NODE_ENV: "production",
          UPSTASH_REDIS_REST_URL: "https://exemplo.upstash.io",
          UPSTASH_REDIS_REST_TOKEN: "token",
        }),
      ).toEqual([]);
    });
  });

  describe("ALLOW_IN_MEMORY_RATE_LIMIT", () => {
    it("libera build de produção local sem Upstash", () => {
      expect(problemsOf({ ...valid, NODE_ENV: "production", ALLOW_IN_MEMORY_RATE_LIMIT: "true" })).toEqual([]);
    });

    it.each(["production", "preview", "development"])("é recusada na Vercel (VERCEL_ENV=%s), e o Upstash continua obrigatório", (vercelEnv) => {
      const problems = problemsOf({ ...valid, NODE_ENV: "production", VERCEL_ENV: vercelEnv, ALLOW_IN_MEMORY_RATE_LIMIT: "true" });
      expect(problems).toEqual(["ALLOW_IN_MEMORY_RATE_LIMIT", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);
    });

    it("desligada por padrão", () => {
      expect(parseEnv(valid).ALLOW_IN_MEMORY_RATE_LIMIT).toBe(false);
    });
  });

  describe("ENABLE_DEV_IMPERSONATION", () => {
    it("só liga com NODE_ENV=development e fora da Vercel", () => {
      expect(parseEnv({ ...valid, ENABLE_DEV_IMPERSONATION: "true" }).ENABLE_DEV_IMPERSONATION).toBe(true);
    });

    const upstash = { UPSTASH_REDIS_REST_URL: "https://exemplo.upstash.io", UPSTASH_REDIS_REST_TOKEN: "token" };

    it.each([
      ["produção", { NODE_ENV: "production", VERCEL_ENV: "production" }],
      ["preview", { NODE_ENV: "production", VERCEL_ENV: "preview" }],
      ["build de produção local", { NODE_ENV: "production" }],
      ["teste", { NODE_ENV: "test" }],
      ["`vercel dev`", { NODE_ENV: "development", VERCEL_ENV: "development" }],
    ])("derruba o app se ligada em %s", (_label, overrides) => {
      expect(problemsOf({ ...valid, ...upstash, ...overrides, ENABLE_DEV_IMPERSONATION: "true" })).toEqual([
        "ENABLE_DEV_IMPERSONATION",
      ]);
    });

    it('qualquer valor diferente de "true"/"false" é erro, não "false" silencioso', () => {
      expect(problemsOf({ ...valid, ENABLE_DEV_IMPERSONATION: "1" })).toEqual(["ENABLE_DEV_IMPERSONATION"]);
      expect(problemsOf({ ...valid, S3_FORCE_PATH_STYLE: "yes" })).toEqual(["S3_FORCE_PATH_STYLE"]);
    });
  });
});
