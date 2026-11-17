// Sessão da requisição atual: cookie -> banco. Usado por páginas, layouts e Server Actions.
// O proxy.ts só redireciona quem não tem cookie; a verificação de verdade é esta (seção 3.5).

import "server-only";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { env } from "../env";
import { type ServiceContext, contextFromSession } from "./context";
import { sessionCookieName, sessionCookieOptions } from "./cookie";
import { type Permission, can, homePathFor } from "./permissions";
import { type AuthSession, findValidSession } from "./sessions";

const SECURE_COOKIE = env.NODE_ENV === "production";
const COOKIE_NAME = sessionCookieName(SECURE_COOKIE);

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}

/** Sessão válida da requisição, ou null. Uma consulta por requisição (cache do React). */
export const getCurrentSession = cache(async (): Promise<AuthSession | null> => {
  const token = await readSessionToken();
  return token ? findValidSession(token) : null;
});

/** Página que exige login: sem sessão, vai para /login. */
export async function requirePageSession(): Promise<AuthSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Página que exige uma permissão. Sem a permissão, 404: a página não existe para esse papel.
 * (O `forbidden()` do Next ainda é experimental.)
 */
export async function requirePagePermission(permission: Permission): Promise<AuthSession> {
  const session = await requirePageSession();
  if (!can(session.user.role, permission)) notFound();
  return session;
}

/** Área inteira (painel ou motorista): quem não tem acesso vai para o início do próprio papel. */
export async function requireArea(permission: "painel.acessar" | "motorista.acessar"): Promise<AuthSession> {
  const session = await requirePageSession();
  if (!can(session.user.role, permission)) redirect(homePathFor(session.user.role));
  return session;
}

export function serviceContext(session: AuthSession): ServiceContext & { sessionId: string } {
  return { ...contextFromSession(session), sessionId: session.sessionId };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, sessionCookieOptions(SECURE_COOKIE, expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  // Mesmos atributos do cookie original: o navegador só remove um cookie "__Host-" se o
  // Set-Cookie de remoção também vier com Secure e Path=/.
  (await cookies()).set(COOKIE_NAME, "", sessionCookieOptions(SECURE_COOKIE, new Date(0)));
}

/** IP e User-Agent da requisição. Na Vercel, x-forwarded-for é preenchido pela própria plataforma. */
export async function requestMeta(): Promise<{ ip: string; userAgent: string | null }> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || list.get("x-real-ip")?.trim() || "desconhecido";
  return { ip, userAgent: list.get("user-agent") };
}
