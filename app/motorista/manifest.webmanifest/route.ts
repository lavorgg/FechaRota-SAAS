// Web App Manifest da área do motorista (seção 5.7). Fica dentro de /motorista de propósito:
// só as páginas do motorista apontam para ele, então o painel não vira "instalável".

import { BACKGROUND_COLOR, DRIVER_SCOPE, THEME_COLOR } from "@/lib/pwa/config";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "FechaRota Motorista",
      short_name: "FechaRota",
      description: "Rotas e comprovantes de entrega do motorista.",
      lang: "pt-BR",
      start_url: DRIVER_SCOPE,
      scope: DRIVER_SCOPE,
      display: "standalone",
      orientation: "portrait",
      theme_color: THEME_COLOR,
      background_color: BACKGROUND_COLOR,
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
