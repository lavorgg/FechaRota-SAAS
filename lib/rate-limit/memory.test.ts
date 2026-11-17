import { describe, expect, it } from "vitest";

import { MemoryRateLimiter } from "./memory";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("MemoryRateLimiter", () => {
  const rule = { name: "teste", max: 3, windowMs: 60_000 };

  it("aceita até o máximo e recusa a partir daí", async () => {
    const c = clock();
    const limiter = new MemoryRateLimiter(rule, c.now);
    expect((await limiter.limit("a")).success).toBe(true);
    expect((await limiter.limit("a")).success).toBe(true);
    expect((await limiter.limit("a")).success).toBe(true);
    const blocked = await limiter.limit("a");
    expect(blocked).toEqual({ success: false, resetAt: 1_000_000 + 60_000 });
  });

  it("tentativas recusadas não estendem o bloqueio", async () => {
    const c = clock();
    const limiter = new MemoryRateLimiter(rule, c.now);
    for (let i = 0; i < 3; i++) await limiter.limit("a");
    c.advance(30_000);
    expect((await limiter.limit("a")).resetAt).toBe(1_000_000 + 60_000);
    c.advance(30_001);
    expect((await limiter.limit("a")).success).toBe(true);
  });

  it("a janela é deslizante: libera uma tentativa por vez conforme as antigas expiram", async () => {
    const c = clock();
    const limiter = new MemoryRateLimiter(rule, c.now);
    await limiter.limit("a");
    c.advance(20_000);
    await limiter.limit("a");
    c.advance(20_000);
    await limiter.limit("a");
    expect((await limiter.limit("a")).success).toBe(false);
    c.advance(20_001); // a primeira saiu da janela
    expect((await limiter.limit("a")).success).toBe(true);
    expect((await limiter.limit("a")).success).toBe(false);
  });

  it("chaves diferentes não interferem", async () => {
    const limiter = new MemoryRateLimiter(rule, clock().now);
    for (let i = 0; i < 3; i++) await limiter.limit("a");
    expect((await limiter.limit("a")).success).toBe(false);
    expect((await limiter.limit("b")).success).toBe(true);
  });

  it("reset zera a contagem da chave", async () => {
    const limiter = new MemoryRateLimiter(rule, clock().now);
    for (let i = 0; i < 3; i++) await limiter.limit("a");
    await limiter.reset("a");
    expect((await limiter.limit("a")).success).toBe(true);
  });
});
