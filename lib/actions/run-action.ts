// Toda Server Action do painel passa por aqui (seção 0, regra 5):
// sessão -> permissão do papel -> plano (somente leitura) -> validação Zod no servidor ->
// serviço. Erros de regra viram mensagem em português; qualquer outro erro vira mensagem
// genérica, e o detalhe vai só para o log do servidor (sem dados do usuário).

import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { getCurrentSession, serviceContext } from "../auth/current";
import type { Permission } from "../auth/permissions";
import { type FieldErrors, MESSAGES, ServiceError } from "../errors";
import { describeErrorForLog, zodFieldErrors } from "./errors";
import type { ActionResult } from "./result";

export type { ActionResult } from "./result";
export { zodFieldErrors } from "./errors";

export const INVALID_DATA = "Confira os campos destacados.";

/** Converte qualquer erro em resultado de action. Redirecionamentos do Next seguem adiante. */
export function errorToResult(error: unknown, label: string): { ok: false; error: string; fieldErrors?: FieldErrors } {
  unstable_rethrow(error);
  if (error instanceof ServiceError) {
    return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
  }
  console.error(`[acao:${label}] erro inesperado: ${describeErrorForLog(error)}`);
  return { ok: false, error: MESSAGES.unexpected };
}

export async function runAction<TSchema extends z.ZodType, TResult>(
  label: string,
  rawInput: unknown,
  options: { schema: TSchema; permission: Permission; write?: boolean },
  handler: (ctx: ServiceContext & { sessionId: string }, input: z.output<TSchema>) => Promise<TResult>,
): Promise<ActionResult<TResult>> {
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false, error: MESSAGES.sessionExpired };

    const ctx = serviceContext(session);
    assertCan(ctx, options.permission);
    if (options.write !== false) assertCanWrite(ctx);

    const parsed = options.schema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: INVALID_DATA, fieldErrors: zodFieldErrors(parsed.error) };
    }
    return { ok: true, data: await handler(ctx, parsed.data) };
  } catch (error) {
    return errorToResult(error, label);
  }
}
