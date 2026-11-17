"use server";

// Entrar, sair, criar conta e (só em desenvolvimento) trocar de perfil.

import { redirect } from "next/navigation";
import { z } from "zod";

import { errorToResult, INVALID_DATA, zodFieldErrors, type ActionResult } from "@/lib/actions/run-action";
import { clearSessionCookie, getCurrentSession, readSessionToken, requestMeta, serviceContext, setSessionCookie } from "@/lib/auth/current";
import { impersonate } from "@/lib/auth/impersonation";
import { authenticate } from "@/lib/auth/login";
import { homePathFor } from "@/lib/auth/permissions";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSession, deleteSessionByToken } from "@/lib/auth/sessions";
import { MESSAGES } from "@/lib/errors";
import { getRateLimiter, minutesUntil } from "@/lib/rate-limit";
import { signupCompany } from "@/lib/services/signup";
import { idSchema } from "@/lib/validation/common";
import { type LoginInput, loginSchema, type SignupInput, signupSchema } from "@/lib/validation/auth";

/**
 * Devolve o destino em vez de redirecionar: o formulário faz um carregamento COMPLETO da
 * página. Na área do motorista isso cria o documento já dentro do escopo do service worker
 * (/motorista), que passa a controlar a página desde o primeiro acesso. Uma navegação interna
 * do Next manteria o documento criado em /login, fora do escopo.
 */
export async function loginAction(input: LoginInput): Promise<ActionResult<{ destination: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_DATA, fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const { ip, userAgent } = await requestMeta();
    const result = await authenticate({ email: parsed.data.email, password: parsed.data.password, ip });
    if (!result.ok) return { ok: false, error: result.error };

    const session = await createSession({ userId: result.user.id, role: result.user.role, userAgent });
    await setSessionCookie(session.token, session.expiresAt);
    return { ok: true, data: { destination: safeNextPath(parsed.data.next) ?? homePathFor(result.user.role) } };
  } catch (error) {
    return errorToResult(error, "login");
  }
}

export async function signupAction(input: SignupInput): Promise<ActionResult> {
  try {
    const { ip, userAgent } = await requestMeta();
    const limit = await getRateLimiter("cadastroPorIp").limit(ip);
    if (!limit.success) {
      const minutes = minutesUntil(limit.resetAt);
      return { ok: false, error: `Muitos cadastros feitos desta rede. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.` };
    }

    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: INVALID_DATA, fieldErrors: zodFieldErrors(parsed.error) };

    const { userId } = await signupCompany(parsed.data);
    const session = await createSession({ userId, role: "ADMIN", userAgent });
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    return errorToResult(error, "cadastro");
  }
  redirect("/app/dashboard");
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await deleteSessionByToken(token);
  await clearSessionCookie();
  redirect("/login");
}

const impersonateSchema = z.object({ userId: idSchema });

export async function impersonateAction(input: { userId: string }): Promise<ActionResult> {
  let destination: string;
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false, error: MESSAGES.sessionExpired };
    const parsed = impersonateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: INVALID_DATA };

    const { userAgent } = await requestMeta();
    const next = await impersonate(serviceContext(session), parsed.data.userId, userAgent);
    await setSessionCookie(next.token, next.expiresAt);
    destination = homePathFor(next.role);
  } catch (error) {
    return errorToResult(error, "troca-de-perfil");
  }
  redirect(destination);
}
