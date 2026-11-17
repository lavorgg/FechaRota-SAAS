// Redireciona para o login quem chega às áreas logadas SEM cookie de sessão.
// Não é a camada de segurança (seção 3.5): a sessão é verificada no banco em cada página,
// Server Action e Route Handler. Aqui só se evita renderizar a página à toa.

import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_INSECURE, SESSION_COOKIE_SECURE } from "./lib/auth/cookie";
import { DRIVER_MANIFEST_URL } from "./lib/pwa/config";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // O navegador busca o manifest sem cookies: ele precisa responder sempre.
  if (pathname === DRIVER_MANIFEST_URL) return NextResponse.next();

  if (request.cookies.has(SESSION_COOKIE_SECURE) || request.cookies.has(SESSION_COOKIE_INSECURE)) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("proximo", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app/:path*", "/motorista/:path*"],
};
