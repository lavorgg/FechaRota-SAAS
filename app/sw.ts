/// <reference lib="webworker" />
// Service worker da área do motorista (seção 3.13).
//
// - Registrado com escopo /motorista: não controla o painel administrativo.
// - Cuida só de arquivos estáticos (JS/CSS/ícones). Dados de negócio nunca passam por aqui:
//   ficam no IndexedDB, sob controle do código do app.
// - Não assume o controle sozinho quando há versão nova: espera o motorista tocar em
//   "Atualizar" (mensagem SKIP_WAITING). Recarregar no meio de uma entrega perderia o formulário.

import type { PrecacheEntry, RouteHandlerCallbackOptions, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Página do app do motorista. Ela não leva dado do usuário (o app busca tudo no navegador),
// então pode ficar em cache para abrir sem sinal (seção 3.13).
const DRIVER_SHELL = "/motorista";
const SHELL_CACHE = "motorista-paginas";
const STATIC_CACHE = "motorista-static";
const NETWORK_TIMEOUT_MS = 4_000;

const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FechaRota</title></head>
<body style="font-family:system-ui,sans-serif;font-size:18px;padding:24px"><h1>Sem conexão</h1><p>Abra o app com internet uma vez para que ele funcione sem sinal.</p></body></html>`;

function cacheableShell(response: Response): boolean {
  return response.status === 200 && response.type === "basic" && !response.redirected;
}

/** Guarda a página e todos os arquivos estáticos que ela cita: página e JS da mesma versão. */
async function storeShell(response: Response): Promise<void> {
  const html = await response.clone().text();
  const assets = new Set<string>();
  for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s)]+/g)) assets.add(match[0]);
  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.all(
    [...assets].map(async (url) => {
      try {
        if (!(await staticCache.match(url))) await staticCache.add(url);
      } catch {
        // Um arquivo que falhou entra no cache na próxima abertura com sinal.
      }
    }),
  );
  await (await caches.open(SHELL_CACHE)).put(DRIVER_SHELL, response);
}

/** Navegação para /motorista: rede primeiro (até 4 s); sem sinal, a última página guardada. */
async function shellHandler({ request, event }: RouteHandlerCallbackOptions): Promise<Response> {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]);
    // Guarda em segundo plano: a página abre sem esperar o cache.
    if (cacheableShell(response)) (event as ExtendableEvent).waitUntil(storeShell(response.clone()).catch(() => undefined));
    return response;
  } catch {
    const cached = await (await caches.open(SHELL_CACHE)).match(DRIVER_SHELL);
    return cached ?? new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

// Já na instalação: a página fica pronta para o primeiro uso sem sinal. Redirecionamento (sem
// login) não é guardado.
self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(DRIVER_SHELL, { credentials: "same-origin", redirect: "manual", cache: "no-store" })
      .then((response) => (cacheableShell(response) ? storeShell(response) : undefined))
      .catch(() => undefined),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request, url, sameOrigin }) => sameOrigin && request.mode === "navigate" && url.pathname === DRIVER_SHELL,
      handler: shellHandler,
    },
    {
      // Arquivos de build do Next têm hash no nome: nunca mudam, podem ficar em cache.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: STATIC_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/icons/"),
      handler: new CacheFirst({
        cacheName: "motorista-icons",
        plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
  ],
});

self.addEventListener("message", (event) => {
  if (typeof event.data === "object" && event.data !== null && (event.data as { type?: unknown }).type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

serwist.addEventListeners();
