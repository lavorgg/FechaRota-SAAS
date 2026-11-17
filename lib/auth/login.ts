// Login por e-mail e senha (seção 5.1; login por telefone descartado pelo dono do produto).

import "server-only";

import { prisma } from "../db";
import { getRateLimiter, minutesUntil, type RateLimiter } from "../rate-limit";
import { verifyPassword } from "./password";
import type { UserRole } from "./permissions";

export const LOGIN_MESSAGES = {
  invalid: "E-mail ou senha incorretos.",
  inactive: "Este usuário está desativado. Fale com o administrador da empresa.",
  tooManyAttempts: (minutes: number) =>
    `Muitas tentativas de login. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`,
} as const;

// Hash bcrypt (custo 12) de um texto aleatório descartado. Comparar contra ele quando o
// e-mail não existe faz a resposta levar o mesmo tempo, e o tempo não revela se a conta existe.
const DUMMY_PASSWORD_HASH = "$2b$12$iZEWFmoVGD1KyoD6qA3u0.BH3rVgJB/5qpd9rsTnj9uVDhHQIolWK";

export type LoginResult =
  | { ok: true; user: { id: string; role: UserRole; companyId: string } }
  | { ok: false; error: string };

export type LoginLimiters = { byEmail: RateLimiter; byIp: RateLimiter };

export function defaultLoginLimiters(): LoginLimiters {
  return { byEmail: getRateLimiter("loginPorEmail"), byIp: getRateLimiter("loginPorIp") };
}

/** `email` já normalizado (minúsculo, sem espaços) pelo schema. */
export async function authenticate(
  params: { email: string; password: string; ip: string },
  limiters: LoginLimiters = defaultLoginLimiters(),
  now: () => number = Date.now,
): Promise<LoginResult> {
  const emailKey = `${params.email}|${params.ip}`;

  const [byIp, byEmail] = await Promise.all([limiters.byIp.limit(params.ip), limiters.byEmail.limit(emailKey)]);
  if (!byIp.success || !byEmail.success) {
    const resetAt = Math.max(byIp.success ? 0 : byIp.resetAt, byEmail.success ? 0 : byEmail.resetAt);
    return { ok: false, error: LOGIN_MESSAGES.tooManyAttempts(minutesUntil(resetAt, now())) };
  }

  const user = await prisma.user.findUnique({
    where: { email: params.email },
    select: { id: true, role: true, companyId: true, active: true, passwordHash: true },
  });

  const passwordOk = await verifyPassword(params.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk) {
    return { ok: false, error: LOGIN_MESSAGES.invalid };
  }
  if (!user.active) {
    return { ok: false, error: LOGIN_MESSAGES.inactive };
  }

  // Login certo zera as tentativas deste e-mail neste IP.
  await limiters.byEmail.reset(emailKey);
  return { ok: true, user: { id: user.id, role: user.role, companyId: user.companyId } };
}
