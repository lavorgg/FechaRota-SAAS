// Troca rápida de perfil para testes (seção 5.1): só com NODE_ENV=development,
// ENABLE_DEV_IMPERSONATION=true e fora da Vercel. Em qualquer outro caso, toda função
// daqui recusa antes de tocar no banco.

import "server-only";

import { env } from "../env";
import { ServiceError, notFound } from "../errors";
import { getTenantDb } from "../tenant-db";
import type { ServiceContext } from "./context";
import type { UserRole } from "./permissions";
import { createSession, deleteSessionById } from "./sessions";

import { type ImpersonationEnv, isImpersonationEnabled as isEnabledFor } from "./impersonation-flag";

export function isImpersonationEnabled(source: ImpersonationEnv = env): boolean {
  return isEnabledFor(source);
}

function assertEnabled(source: ImpersonationEnv): void {
  if (!isImpersonationEnabled(source)) {
    throw new ServiceError("SEM_PERMISSAO", "A troca de perfil só existe no ambiente de desenvolvimento.");
  }
}

export type ImpersonationTarget = { id: string; name: string; role: UserRole };

export async function listImpersonationTargets(ctx: ServiceContext, source: ImpersonationEnv = env): Promise<ImpersonationTarget[]> {
  assertEnabled(source);
  return getTenantDb(ctx).user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

/** Cria uma sessão para outro usuário ativo DA MESMA EMPRESA e encerra a sessão atual. */
export async function impersonate(
  ctx: ServiceContext & { sessionId: string },
  targetUserId: string,
  userAgent: string | null,
  source: ImpersonationEnv = env,
): Promise<{ token: string; expiresAt: Date; role: UserRole }> {
  assertEnabled(source);
  const target = await getTenantDb(ctx).user.findFirst({
    where: { id: targetUserId, active: true },
    select: { id: true, role: true },
  });
  if (!target) throw notFound();

  const session = await createSession({ userId: target.id, role: target.role, userAgent });
  await deleteSessionById(ctx.sessionId);
  return { ...session, role: target.role };
}
