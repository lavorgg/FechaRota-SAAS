// Token de sessão (seção 5.1). O navegador guarda o token; o banco guarda só o hash SHA-256.
// Quem lê o banco não consegue montar um cookie válido.

import { createHash, randomBytes } from "node:crypto";

import type { UserRole } from "./permissions";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Duração da sessão: 30 dias para motorista, 12 horas para o painel. */
export const SESSION_TTL_MS: Readonly<Record<UserRole, number>> = {
  MOTORISTA: 30 * DAY_MS,
  ADMIN: 12 * HOUR_MS,
  EXPEDICAO: 12 * HOUR_MS,
};

/** 32 bytes aleatórios em base64url = 43 caracteres. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isWellFormedSessionToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sessionExpiresAt(role: UserRole, now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS[role]);
}
