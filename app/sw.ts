/// <reference lib="webworker" />
// Service worker da área do motorista (seção 3.13).
//
// - Registrado com escopo /motorista: não controla o painel administrativo.
// - Cuida só de arquivos estáticos (JS/CSS/ícones). Dados de negócio nunca passam por aqui:
//   ficam no IndexedDB, sob controle do código do app.
// - Não assume o controle sozinho quando há versão nova: espera o motorista tocar em
//   "Atualizar" (mensagem SKIP_WAITING). Recarregar no meio de uma entrega perderia o formulário.

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // Arquivos de build do Next têm hash no nome: nunca mudam, podem ficar em cache.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "motorista-static",
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
