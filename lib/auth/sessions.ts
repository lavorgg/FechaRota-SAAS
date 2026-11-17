// Sessões no banco (seção 5.1). A tabela Session não tem companyId e só é acessada aqui,
// pelo client global: o client por empresa recusa esse modelo.

import "server-only";

import { prisma } from "../db";
import type { UserRole } from "./permissions";
import type { PlanStatus } from "./plan";
import { generateSessionToken, hashSessionToken, isWellFormedSessionToken, sessionExpiresAt } from "./session-token";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
};

export type AuthCompany = {
  id: string;
  name: string;
  timezone: string;
  planStatus: PlanStatus;
};

export type AuthSession = {
  sessionId: string;
  expiresAt: Date;
  user: AuthUser;
  company: AuthCompany;
};

/** Limite do User-Agent guardado (só para o usuário reconhecer o aparelho). */
const MAX_USER_AGENT_LENGTH = 300;

export async function createSession(params: { userId: string; role: UserRole; userAgent: string | null; now?: Date }): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt(params.role, params.now);
  await prisma.session.create({
    data: {
      userId: params.userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: params.userAgent ? params.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    },
  });
  return { token, expiresAt };
}

/**
 * Sessão válida para o token, ou null.
 * Papel, situação do usuário e plano da empresa são lidos do banco a cada requisição:
 * desativar um usuário ou mudar o papel vale imediatamente.
 */
export async function findValidSession(token: string, now: Date = new Date()): Promise<AuthSession | null> {
  if (!isWellFormedSessionToken(token)) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          companyId: true,
          company: { select: { id: true, name: true, timezone: true, planStatus: true } },
        },
      },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= now.getTime()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (!session.user.active) return null;

  const { user } = session;
  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId },
    company: user.company,
  };
}

export async function deleteSessionByToken(token: string): Promise<void> {
  if (!isWellFormedSessionToken(token)) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Encerra todas as sessões de um usuário (troca de papel, desativação, nova senha). */
export async function deleteSessionsOfUser(userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { userId } });
  return result.count;
}
