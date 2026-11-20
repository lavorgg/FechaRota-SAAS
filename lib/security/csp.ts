// Content Security Policy (seção 6): compatível com o app, o service worker e o storage.
// Módulo puro, usado pelo proxy.ts a cada página.
//
// - scripts: só com o nonce da requisição ('strict-dynamic' libera o que eles carregam);
// - estilos: 'unsafe-inline', porque o React, o Radix e o Sonner usam style inline;
// - storage: o celular envia fotos direto (connect-src) e o acerto mostra comprovantes (img-src);
// - ViaCEP: a busca de CEP é feita no navegador;
// - worker-src explícito: com 'strict-dynamic', o 'self' do script-src não vale para o service worker.

export const VIACEP_ORIGIN = "https://viacep.com.br";

/** Origem das URLs pré-assinadas: o endpoint (path style) ou "bucket.endpoint" (virtual host). */
export function storageOrigin(params: { endpoint: string | undefined; bucket: string | undefined; forcePathStyle: boolean }): string | null {
  if (!params.endpoint) return null;
  let url: URL;
  try {
    url = new URL(params.endpoint);
  } catch {
    return null;
  }
  if (params.forcePathStyle || !params.bucket) return url.origin;
  return `${url.protocol}//${params.bucket}.${url.host}`;
}

export function buildCsp(params: { nonce: string; dev: boolean; storageOrigin: string | null; upgradeInsecureRequests: boolean }): string {
  const storage = params.storageOrigin ? ` ${params.storageOrigin}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${params.nonce}' 'strict-dynamic'${params.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${storage}`,
    "font-src 'self'",
    `connect-src 'self'${storage} ${VIACEP_ORIGIN}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(params.upgradeInsecureRequests ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

/** Nonce novo a cada requisição (128 bits). */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
