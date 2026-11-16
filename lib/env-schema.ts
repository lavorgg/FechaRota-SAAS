// Schema das variáveis de ambiente (seção 3.12). Módulo puro: não lê process.env.
// Nunca imprime o VALOR de nenhuma variável, só o nome e o motivo.

import { z } from "zod";

const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const booleanFlag = z.preprocess(blankToUndefined, z.enum(["true", "false"]).default("false")).transform((v) => v === "true");

const postgresUrl = z
  .string({ error: "obrigatória" })
  .regex(/^postgres(ql)?:\/\/.+/, "deve começar com postgresql://");

const requiredText = z.string({ error: "obrigatória" }).min(1, "obrigatória");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Definida pela Vercel. Ausente fora dela.
    VERCEL_ENV: z.preprocess(blankToUndefined, z.enum(["production", "preview", "development"]).optional()),

    DATABASE_URL: postgresUrl,
    DIRECT_URL: postgresUrl,

    S3_ENDPOINT: z.url({ error: "deve ser uma URL (ex.: https://<conta>.r2.cloudflarestorage.com)" }),
    S3_REGION: requiredText,
    S3_ACCESS_KEY_ID: requiredText,
    S3_SECRET_ACCESS_KEY: requiredText,
    S3_BUCKET: requiredText,
    S3_FORCE_PATH_STYLE: booleanFlag,

    UPSTASH_REDIS_REST_URL: z.preprocess(blankToUndefined, z.url({ error: "deve ser uma URL https" }).optional()),
    UPSTASH_REDIS_REST_TOKEN: z.preprocess(blankToUndefined, z.string().optional()),

    CRON_SECRET: z.string({ error: "obrigatória" }).min(32, "deve ter pelo menos 32 caracteres"),

    ENABLE_DEV_IMPERSONATION: booleanFlag,
    // Permite rodar um build de produção NA MÁQUINA LOCAL (pnpm build && pnpm start, usado
    // pelos testes E2E) sem Upstash, com rate limit em memória. Recusada dentro da Vercel.
    ALLOW_IN_MEMORY_RATE_LIMIT: booleanFlag,
  })
  .superRefine((value, ctx) => {
    if (value.ALLOW_IN_MEMORY_RATE_LIMIT && value.VERCEL_ENV !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOW_IN_MEMORY_RATE_LIMIT"],
        message: "não pode ser \"true\" na Vercel: lá o rate limit é sempre no Upstash",
      });
    }
    // Rate limit em memória só existe em desenvolvimento, nos testes automatizados e em build
    // local com a permissão explícita acima. Em qualquer deploy na Vercel o Upstash é obrigatório.
    const upstashOptional =
      value.NODE_ENV === "development" || value.NODE_ENV === "test" || (value.ALLOW_IN_MEMORY_RATE_LIMIT && value.VERCEL_ENV === undefined);
    if (!upstashOptional) {
      if (!value.UPSTASH_REDIS_REST_URL) {
        ctx.addIssue({ code: "custom", path: ["UPSTASH_REDIS_REST_URL"], message: "obrigatória fora de desenvolvimento" });
      }
      if (!value.UPSTASH_REDIS_REST_TOKEN) {
        ctx.addIssue({ code: "custom", path: ["UPSTASH_REDIS_REST_TOKEN"], message: "obrigatória fora de desenvolvimento" });
      }
    }
    // Troca de perfil: inalcançável em produção e em preview. Ligar fora de dev derruba o app.
    if (value.ENABLE_DEV_IMPERSONATION && (value.NODE_ENV !== "development" || value.VERCEL_ENV !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["ENABLE_DEV_IMPERSONATION"],
        message: "só pode ser \"true\" com NODE_ENV=development e fora da Vercel",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvError extends Error {
  constructor(public readonly problems: ReadonlyArray<{ name: string; message: string }>) {
    super(
      [
        "Configuração de ambiente inválida. Corrija as variáveis abaixo (veja o .env.example):",
        ...problems.map((p) => `  - ${p.name}: ${p.message}`),
      ].join("\n"),
    );
    this.name = "InvalidEnvError";
  }
}

/** Valida um conjunto de variáveis. Exportada para os testes. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvError(
      result.error.issues.map((issue) => ({
        name: issue.path.join(".") || "(ambiente)",
        message: issue.message,
      })),
    );
  }
  return result.data;
}
