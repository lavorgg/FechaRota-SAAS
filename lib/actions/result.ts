// Resultado de toda Server Action: sucesso com dados, ou erro em português com os erros
// de cada campo do formulário. Sem dependência de servidor: usado também pelos formulários.

import type { FieldErrors, ServiceErrorCode } from "../errors";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors; code?: ServiceErrorCode };
