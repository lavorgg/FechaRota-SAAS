// Rate limiting (seções 3.12 e 5.1): Upstash Redis em qualquer deploy, memória só na
// máquina local. As chaves vão para o Redis como hash SHA-256: e-mail e IP não ficam
// gravados em texto.

import "server-only";

import { createHash } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "../env";
import { MemoryRateLimiter } from "./memory";
import type { RateLimitRule, RateLimiter } from "./types";

export type { RateLimitResult, RateLimitRule, RateLimiter } from "./types";

const MINUTE_MS = 60 * 1000;

export const RATE_LIMIT_RULES = {
  /** Tentativas de login por e-mail + IP. Login certo zera a contagem. */
  loginPorEmail: { name: "login-email", max: 10, windowMs: 15 * MINUTE_MS },
  /** Tentativas de login por IP, com qualquer e-mail (contra teste de muitas contas). */
  loginPorIp: { name: "login-ip", max: 100, windowMs: 15 * MINUTE_MS },
  /** Cadastros de empresa por IP. */
  cadastroPorIp: { name: "cadastro-ip", max: 5, windowMs: 60 * MINUTE_MS },
  /**
   * Endpoints da área do motorista, por usuário. Folga para descarregar a fila de um dia sem
   * sinal (presign + finalização por entrega) de uma vez.
   */
  motoristaPorUsuario: { name: "motorista-usuario", max: 120, windowMs: MINUTE_MS },
} as const satisfies Record<string, RateLimitRule>;

export function hashRateLimitKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 32);
}

class UpstashRateLimiter implements RateLimiter {
  private readonly ratelimit: Ratelimit;

  constructor(redis: Redis, rule: RateLimitRule, prefix: string) {
    this.ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(rule.max, `${Math.round(rule.windowMs / 1000)} s`),
      prefix: `${prefix}:${rule.name}`,
      // Sem cache em memória da instância (seção 3.12: nada de estado entre requisições).
      ephemeralCache: false,
      analytics: false,
    });
  }

  async limit(key: string) {
    const result = await this.ratelimit.limit(hashRateLimitKey(key));
    if (result.reason === "timeout") {
      // O Upstash não respondeu a tempo e a tentativa foi liberada. Disponibilidade do login
      // vale mais que bloquear todo mundo; o aviso fica no log do servidor.
      console.warn("[rate-limit] Upstash não respondeu a tempo; tentativa liberada.");
    }
    return { success: result.success, resetAt: result.reset };
  }

  async reset(key: string) {
    await this.ratelimit.resetUsedTokens(hashRateLimitKey(key));
  }
}

type LimiterName = keyof typeof RATE_LIMIT_RULES;

// Em memória: guardado no globalThis para sobreviver ao hot reload do `next dev`.
const globalForLimiters = globalThis as typeof globalThis & {
  __fecharotaMemoryLimiters?: Map<LimiterName, MemoryRateLimiter>;
};

function memoryLimiter(name: LimiterName): RateLimiter {
  const store = (globalForLimiters.__fecharotaMemoryLimiters ??= new Map());
  let limiter = store.get(name);
  if (!limiter) {
    limiter = new MemoryRateLimiter(RATE_LIMIT_RULES[name]);
    store.set(name, limiter);
  }
  return limiter;
}

let redis: Redis | null = null;

export function getRateLimiter(name: LimiterName): RateLimiter {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    redis ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
    // Prefixo por ambiente: produção e preview nunca compartilham contadores.
    return new UpstashRateLimiter(redis, RATE_LIMIT_RULES[name], `fecharota:${env.VERCEL_ENV ?? "local"}`);
  }
  const memoryAllowed =
    env.VERCEL_ENV === undefined && (env.NODE_ENV === "development" || env.NODE_ENV === "test" || env.ALLOW_IN_MEMORY_RATE_LIMIT);
  if (!memoryAllowed) {
    throw new Error("Rate limit sem Upstash configurado fora da máquina local.");
  }
  return memoryLimiter(name);
}

/** Minutos até a próxima tentativa, arredondado para cima (mínimo 1), para a mensagem. */
export function minutesUntil(resetAt: number, now: number = Date.now()): number {
  return Math.max(1, Math.ceil((resetAt - now) / MINUTE_MS));
}
