// Endpoints da área do motorista (/api/motorista/*, seção 5.7). São Route Handlers, não Server
// Actions: a fila offline chama com fetch e precisa de status HTTP para separar erro
// temporário (tenta de novo) de erro definitivo ("Precisa de atenção").
//
// Cada chamada: origem (só o próprio site, contra CSRF) -> sessão -> permissão -> rate limit
// -> JSON + Zod -> serviço. Respostas nunca vão para cache.

import "server-only";

import type { z } from "zod";

import { describeErrorForLog, zodFieldErrors } from "../actions/errors";
import type { ServiceContext } from "../auth/context";
import { getCurrentSession, serviceContext } from "../auth/current";
import { can } from "../auth/permissions";
import { MESSAGES, ServiceError, type ServiceErrorCode } from "../errors";
import { getRateLimiter } from "../rate-limit";
import { MISSING_FILE_CODE, MissingFileError } from "../services/deliveries";

export type ApiFailure = { ok: false; error: string; code: string; fieldErrors?: Record<string, string> };
export type ApiSuccess<T> = { ok: true; data: T };

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  NAO_ENCONTRADO: 404,
  SEM_PERMISSAO: 403,
  SOMENTE_LEITURA: 403,
  CONFLITO: 409,
  VALIDACAO: 422,
  CONFIRMACAO: 409,
};

const NO_STORE = { "Cache-Control": "no-store" };

function failure(status: number, body: ApiFailure): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Mutação só do próprio site: o navegador sempre manda Origin num POST com fetch. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const expected = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    try {
      return new URL(origin).host === expected;
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

type Options<TSchema extends z.ZodType | undefined> = { label: string; schema?: TSchema; mutation: boolean };

export async function driverApi<TSchema extends z.ZodType | undefined, T>(
  request: Request,
  options: Options<TSchema>,
  handler: (ctx: ServiceContext, data: TSchema extends z.ZodType ? z.output<TSchema> : undefined) => Promise<T>,
): Promise<Response> {
  try {
    if (options.mutation && !isSameOrigin(request)) return failure(403, { ok: false, error: MESSAGES.forbidden, code: "ORIGEM" });

    const session = await getCurrentSession();
    if (!session) return failure(401, { ok: false, error: "Sua sessão expirou. Entre de novo: as entregas continuam guardadas no celular.", code: "SESSAO" });
    if (!can(session.user.role, "motorista.acessar") || !can(session.user.role, "entregas.registrar")) {
      return failure(403, { ok: false, error: MESSAGES.forbidden, code: "SEM_PERMISSAO" });
    }

    const limit = await getRateLimiter("motoristaPorUsuario").limit(session.user.id);
    if (!limit.success) return failure(429, { ok: false, error: "Muitas requisições seguidas. O envio continua em instantes.", code: "LIMITE" });

    let data: unknown = undefined;
    if (options.schema) {
      if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
        return failure(415, { ok: false, error: "Formato de envio inválido.", code: "FORMATO" });
      }
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return failure(400, { ok: false, error: "Formato de envio inválido.", code: "FORMATO" });
      }
      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) return failure(422, { ok: false, error: "Dados da entrega inválidos.", code: "VALIDACAO", fieldErrors: zodFieldErrors(parsed.error) });
      data = parsed.data;
    }

    const result = await handler(serviceContext(session), data as TSchema extends z.ZodType ? z.output<TSchema> : undefined);
    return Response.json({ ok: true, data: result } satisfies ApiSuccess<T>, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof MissingFileError) return failure(422, { ok: false, error: error.message, code: MISSING_FILE_CODE });
    if (error instanceof ServiceError) return failure(STATUS_BY_CODE[error.code], { ok: false, error: error.message, code: error.code });
    console.error(`[api:${options.label}] erro inesperado: ${describeErrorForLog(error)}`);
    return failure(500, { ok: false, error: MESSAGES.unexpected, code: "INESPERADO" });
  }
}
