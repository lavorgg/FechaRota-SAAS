// Gera os ícones do PWA em public/icons a partir de um SVG, usando o Chromium do Playwright.
// Rode com: node scripts/generate-icons.mjs  (só é preciso de novo se o desenho mudar)

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const OUT_DIR = path.resolve(import.meta.dirname, "../public/icons");
const BRAND = "#14532d";

/** `inset` = fração do lado ocupada pelo desenho. Ícones "maskable" precisam de margem maior. */
function svg(size, { inset, rounded }) {
  const radius = rounded ? size * 0.22 : 0;
  const scale = (size * inset) / 100;
  const offset = (size - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M36 68 L52 52" stroke-width="9" stroke-dasharray="0.1 16"/>
    <circle cx="20" cy="82" r="9" fill="#ffffff" stroke="none"/>
    <path d="M56 32 L68 44 L90 14" stroke-width="10"/>
  </g>
</svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, inset: 0.72, rounded: true },
  { file: "icon-512.png", size: 512, inset: 0.72, rounded: true },
  { file: "icon-maskable-192.png", size: 192, inset: 0.56, rounded: false },
  { file: "icon-maskable-512.png", size: 512, inset: 0.56, rounded: false },
  { file: "apple-touch-icon.png", size: 180, inset: 0.68, rounded: false },
  { file: "favicon-48.png", size: 48, inset: 0.8, rounded: true },
];

await mkdir(OUT_DIR, { recursive: true });
// PLAYWRIGHT_CHROMIUM_PATH: opcional, para usar um Chromium já instalado na máquina.
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(icon.size, icon)}`);
    await page.screenshot({ path: path.join(OUT_DIR, icon.file), omitBackground: true });
    await page.close();
    console.log(`public/icons/${icon.file}`);
  }
} finally {
  await browser.close();
}
