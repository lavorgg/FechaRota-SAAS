// Serve o service worker compilado em /serwist/sw.js (integração @serwist/turbopack).
// É gerado no build (rota estática); em `next dev` o service worker não é registrado.

import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  // Nada é pré-cacheado por varredura de arquivos: isso incluiria os scripts do painel
  // administrativo, que não pode ficar em cache (seção 3.13). Os assets da área do motorista
  // entram no cache quando as páginas do motorista os pedem (ver app/sw.ts).
  globPatterns: [],
});
