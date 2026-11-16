// Constantes do PWA do motorista (seções 3.13 e 5.7), usadas no manifest, no registro do
// service worker e nos testes.

/** O service worker só controla a área do motorista. O painel nunca é cacheado. */
export const DRIVER_SCOPE = "/motorista";
export const SERVICE_WORKER_URL = "/serwist/sw.js";
export const DRIVER_MANIFEST_URL = "/motorista/manifest.webmanifest";

export const THEME_COLOR = "#14532d";
export const BACKGROUND_COLOR = "#ffffff";
