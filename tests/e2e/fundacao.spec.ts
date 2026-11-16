// Fase 1: o que precisa estar de pé num deploy "vazio" — saúde, manifest e service worker.

import { expect, test } from "@playwright/test";

test("a página de saúde confirma banco e storage", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ status: "ok", checks: { database: "ok", storage: "ok" } });
});

test("cabeçalhos de segurança básicos em toda resposta", async ({ request }) => {
  for (const path of ["/", "/motorista", "/api/health"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
  }
});

test("o manifest do motorista é instalável e restrito a /motorista", async ({ page, request }) => {
  await page.goto("/motorista");
  await expect(page.getByRole("heading", { name: "Área do motorista" })).toBeVisible();

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/motorista/manifest.webmanifest");

  const response = await request.get(href ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "FechaRota Motorista",
    short_name: "FechaRota",
    start_url: "/motorista",
    scope: "/motorista",
    display: "standalone",
    theme_color: "#14532d",
    background_color: "#ffffff",
  });

  const icons = manifest.icons as Array<{ src: string; sizes: string; purpose: string; type: string }>;
  expect(icons.filter((icon) => icon.purpose === "any").map((icon) => icon.sizes).sort()).toEqual(["192x192", "512x512"]);
  expect(icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
  for (const icon of icons) {
    const file = await request.get(icon.src);
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()["content-type"], icon.src).toBe("image/png");
  }

  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(appleIcon ?? "")).status()).toBe(200);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#14532d");
});

test("o painel não aponta para o manifest do motorista", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
});

test("o service worker é registrado só para a área do motorista", async ({ page, baseURL }) => {
  await page.goto("/motorista");

  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, script: ready.active?.scriptURL ?? null, state: ready.active?.state ?? null };
  });
  expect(registration.scope).toBe(`${baseURL}/motorista`);
  expect(registration.script).toBe(`${baseURL}/serwist/sw.js`);

  // Depois de ativo, o service worker controla as páginas do motorista...
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBe(`${baseURL}/serwist/sw.js`);

  // ...e não controla nada fora de /motorista.
  await page.goto("/");
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.scope ?? null)).toBeNull();
});

test("o service worker não recarrega nem assume sozinho uma versão nova", async ({ request }) => {
  const response = await request.get("/serwist/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-cache");
  const source = await response.text();
  expect(source).toContain("SKIP_WAITING");
  // Dados de negócio nunca entram no cache do service worker: nenhuma rota de API é citada.
  expect(source).not.toContain("/api/");
});
