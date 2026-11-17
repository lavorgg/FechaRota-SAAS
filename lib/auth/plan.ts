// Situação do plano (seção 4, Company): PAST_DUE e CANCELED deixam o painel só para consulta.
// O motorista SEMPRE consegue finalizar a rota em andamento (Fase 5): as ações dele passam
// `allowWhenReadOnly`.

export const PLAN_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export function planAllowsWrite(status: PlanStatus): boolean {
  return status === "TRIAL" || status === "ACTIVE";
}

export const TRIAL_DAYS = 14;
