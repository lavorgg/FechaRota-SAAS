import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// Valida as variáveis de ambiente em todo `next dev`, `next build` e `next start`.
// Se faltar alguma, o comando falha aqui, com a lista do que corrigir (seção 3.12).
import "./lib/env";

const nextConfig: NextConfig = {
  // `cacheComponents` fica desligado de propósito: a integração do Serwist com Turbopack
  // (@serwist/turbopack) depende de Route Handler com `dynamic = "force-static"`, que não
  // existe com cacheComponents ligado. Ver README, "PWA e service worker".
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  logging: {
    // Em desenvolvimento o Next imprime os argumentos de toda Server Action, inclusive a senha
    // do login. Seção 6: nenhum log com senha.
    serverFunctions: false,
  },
  async rewrites() {
    // Navegadores pedem /favicon.ico por conta própria, mesmo com <link rel="icon">.
    return [{ source: "/favicon.ico", destination: "/icons/favicon-48.png" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Câmera e localização só do próprio site (comprovante); nada de microfone ou pagamento.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
          // HSTS só no deploy (https); localmente tudo roda em http.
          ...(process.env.VERCEL_ENV ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
      {
        // O navegador precisa sempre buscar o service worker mais recente.
        source: "/serwist/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default withSerwist(nextConfig);
