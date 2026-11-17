import "server-only";

import { contextFromSession } from "./context";
import { type ImpersonationTarget, isImpersonationEnabled, listImpersonationTargets } from "./impersonation";
import type { AuthSession } from "./sessions";

/** Usuários para a troca de perfil, ou null quando a troca está desligada. */
export async function impersonationTargetsFor(session: AuthSession): Promise<ImpersonationTarget[] | null> {
  if (!isImpersonationEnabled()) return null;
  return listImpersonationTargets(contextFromSession(session));
}
