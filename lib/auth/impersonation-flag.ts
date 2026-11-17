// Quando a troca rápida de perfil existe (seção 5.1). Módulo puro, testado com todas as
// combinações de ambiente.

import type { Env } from "../env-schema";

export type ImpersonationEnv = Pick<Env, "NODE_ENV" | "VERCEL_ENV" | "ENABLE_DEV_IMPERSONATION">;

export function isImpersonationEnabled(source: ImpersonationEnv): boolean {
  return source.ENABLE_DEV_IMPERSONATION === true && source.NODE_ENV === "development" && source.VERCEL_ENV === undefined;
}
