// Limitador em memória (janela deslizante por registro de tentativas).
// SÓ para desenvolvimento, testes e build local: na Vercel a memória não é compartilhada
// entre instâncias e o Upstash é obrigatório (lib/env-schema.ts garante).

import type { RateLimitResult, RateLimitRule, RateLimiter } from "./types";

export class MemoryRateLimiter implements RateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const windowStart = now - this.rule.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((at) => at > windowStart);

    if (recent.length >= this.rule.max) {
      this.attempts.set(key, recent);
      const oldest = recent[0] ?? now;
      return { success: false, resetAt: oldest + this.rule.windowMs };
    }

    recent.push(now);
    this.attempts.set(key, recent);
    const oldest = recent[0] ?? now;
    return { success: true, resetAt: oldest + this.rule.windowMs };
  }

  async reset(key: string): Promise<void> {
    this.attempts.delete(key);
  }
}
