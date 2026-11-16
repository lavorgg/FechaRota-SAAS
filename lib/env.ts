// Variáveis de ambiente validadas na inicialização (seção 3.12).
// Importado pelo next.config.ts: se faltar alguma variável, o build falha com a lista do que falta.

import { type Env, parseEnv } from "./env-schema";

export type { Env } from "./env-schema";

export const env: Env = parseEnv(process.env);


/** Verdadeiro somente no ambiente de produção da Vercel. */
export const isVercelProduction = env.VERCEL_ENV === "production";
