import { describe, expect, it } from "vitest";

import { sessionCookieName, sessionCookieOptions } from "./cookie";
import { SESSION_TTL_MS, generateSessionToken, hashSessionToken, isWellFormedSessionToken, sessionExpiresAt } from "./session-token";

describe("token de sessão", () => {
  it("tem 43 caracteres base64url e não se repete", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(isWellFormedSessionToken(token)).toBe(true);
  });

  it("o banco guarda só o hash SHA-256", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hash);
  });

  it("recusa token malformado antes de consultar o banco", () => {
    for (const token of ["", "curto", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}/`]) {
      expect(isWellFormedSessionToken(token)).toBe(false);
    }
  });

  it("dura 30 dias para motorista e 12 horas para o painel", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    expect(sessionExpiresAt("MOTORISTA", now).toISOString()).toBe("2026-12-17T12:00:00.000Z");
    expect(sessionExpiresAt("ADMIN", now).toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(sessionExpiresAt("EXPEDICAO", now).toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(SESSION_TTL_MS.MOTORISTA).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("cookie de sessão", () => {
  it("HttpOnly, SameSite=Lax e Path=/ sempre; Secure e prefixo __Host- em produção", () => {
    const expires = new Date("2026-12-01T00:00:00Z");
    expect(sessionCookieName(true)).toBe("__Host-fecharota-sessao");
    expect(sessionCookieName(false)).toBe("fecharota-sessao");
    expect(sessionCookieOptions(true, expires)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires });
    expect(sessionCookieOptions(false, expires)).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", expires });
  });
});
