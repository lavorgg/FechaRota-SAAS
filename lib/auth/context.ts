// Contexto de quem está agindo, passado a todo serviço. Vem SEMPRE da sessão verificada no
// servidor, nunca de dados enviados pelo navegador.

import { MESSAGES, ServiceError } from "../errors";
import { type Permission, type UserRole, can } from "./permissions";
import { type PlanStatus, planAllowsWrite } from "./plan";

export type ServiceContext = {
  userId: string;
  companyId: string;
  role: UserRole;
  planStatus: PlanStatus;
  timezone: string;
};

export function contextFromSession(session: {
  user: { id: string; companyId: string; role: UserRole };
  company: { planStatus: PlanStatus; timezone: string };
}): ServiceContext {
  return {
    userId: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role,
    planStatus: session.company.planStatus,
    timezone: session.company.timezone,
  };
}

export function assertCan(ctx: ServiceContext, permission: Permission): void {
  if (!can(ctx.role, permission)) {
    throw new ServiceError("SEM_PERMISSAO", MESSAGES.forbidden);
  }
}

/** Plano em atraso ou cancelado: só leitura. */
export function assertCanWrite(ctx: ServiceContext): void {
  if (!planAllowsWrite(ctx.planStatus)) {
    throw new ServiceError("SOMENTE_LEITURA", MESSAGES.readOnly);
  }
}
