// Roda antes de cada página:
// 1. Content Security Policy com nonce novo por requisição (seção 6). O Next aplica o nonce aos
//    próprios scripts lendo o cabeçalho da requisição.
// 2. Quem chega às áreas logadas SEM cookie de sessão vai para o login. Não é a camada de
//    segurança (seção 3.5): a sessão é verificada no banco em cada página, Server Action e
//    Route Handler. Aqui só se evita renderizar a página à toa.

import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_INSECURE, SESSION_COOKIE_SECURE } from "./lib/auth/cookie";
import { DRIVER_MANIFEST_URL } from "./lib/pwa/config";
import { buildCsp, createNonce, storageOrigin } from "./lib/security/csp";

const LOGGED_AREAS = ["/app", "/motorista"];

function inLoggedArea(pathname: string): boolean {
  return LOGGED_AREAS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // O navegador busca o manifest sem cookies: ele precisa responder sempre.
  if (pathname === DRIVER_MANIFEST_URL) return NextResponse.next();

  if (inLoggedArea(pathname) && !request.cookies.has(SESSION_COOKIE_SECURE) && !request.cookies.has(SESSION_COOKIE_INSECURE)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("proximo", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    storageOrigin: storageOrigin({ endpoint: process.env.S3_ENDPOINT, bucket: process.env.S3_BUCKET, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" }),
    // Só no deploy (https): localmente o storage é http://localhost:9000.
    upgradeInsecureRequests: Boolean(process.env.VERCEL_ENV),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Páginas. Ficam de fora: API, arquivos estáticos, ícones e o service worker.
      source: "/((?!api/|_next/static|_next/image|favicon.ico|icon.png|icons/|serwist/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
