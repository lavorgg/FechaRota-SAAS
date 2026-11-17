// Nome e opções do cookie de sessão (seção 5.1). Sem dependências: usado também pelo proxy.ts.
//
// Em produção o cookie usa o prefixo "__Host-": o navegador só o aceita com Secure, Path=/ e
// sem Domain, o que impede um subdomínio de sobrescrevê-lo.

export const SESSION_COOKIE_SECURE = "__Host-fecharota-sessao";
export const SESSION_COOKIE_INSECURE = "fecharota-sessao";

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE_SECURE : SESSION_COOKIE_INSECURE;
}

export function sessionCookieOptions(secure: boolean, expiresAt: Date) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
