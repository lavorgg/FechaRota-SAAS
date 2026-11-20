// Filtros da tela de auditoria (vêm da URL).

import { z } from "zod";

import { isValidDateString } from "../../domain/dates";

const optionalDate = z
  .string()
  .optional()
  .transform((value) => (value && isValidDateString(value) ? value : undefined));

export const listAuditSchema = z.object({
  de: optionalDate,
  ate: optionalDate,
  tipo: z
    .string()
    .optional()
    .transform((value) => (value && /^[A-Z_]{3,60}$/.test(value) ? value : undefined)),
  pagina: z.coerce.number().int().min(1).catch(1).default(1),
});
export type ListAuditData = z.output<typeof listAuditSchema>;
