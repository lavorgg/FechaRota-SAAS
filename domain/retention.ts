// Retenção de fotos e assinaturas dos comprovantes (seção 6). Limites decididos pelo dono do
// produto: de 3 a 60 meses.

import { subtractMonths } from "./dates";

export const RETENTION_MONTHS_MIN = 3;
export const RETENTION_MONTHS_MAX = 60;

/** Arquivos criados antes deste instante já passaram da retenção. */
export function retentionCutoff(now: Date, months: number): Date {
  return subtractMonths(now, months);
}
