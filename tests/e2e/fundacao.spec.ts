// Fase 1: saúde, manifest e service worker, agora com a área do motorista exigindo login.

import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

test("a página de saúde confirma banco e storage", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ status: "ok", checks: { database: "ok", storage: "ok" } });
});

test("cabeçalhos de segurança básicos em toda resposta", async ({ request }) => {
  for (const path of ["/", "/login", "/api/health"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["permissions-policy"], path).toContain("camera=(self)");
  }
});

test("CSP com nonce novo por página e nenhuma violação no login, no painel e na área do motorista", async ({ page, request }) => {
  const first = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  const second = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  expect(first).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(first).toContain("frame-ancestors 'none'");
  expect(first).toContain("worker-src 'self'");
  expect(first).not.toContain("unsafe-eval");
  expect(first).not.toBe(second);

  await page.addInitScript(() => {
    const store = window as unknown as { __csp: string[] };
    store.__csp = [];
    document.addEventListener("securitypolicyviolation", (event) => store.__csp.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  const violations = () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  expect(await violations()).toEqual([]);
  // Endereço inexistente: a página 404 também leva o nonce.
  const notFound = await page.goto("/endereco-que-nao-existe");
  expect(notFound?.status()).toBe(404);
  expect(notFound?.headers()["content-security-policy"]).toMatch(/'nonce-/);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  expect(await violations()).toEqual([]);
  await login(page, USERS.motorista);
  await expect(page.getByTestId("indicador-sincronizacao")).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  expect(await violations()).toEqual([]);
  await page.context().clearCookies();
  await login(page, USERS.admin);
  for (const path of ["/app/dashboard", "/app/rotas", "/app/pedidos", "/app/clientes/novo"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await violations(), path).toEqual([]);
  }
});

test("o manifest responde sem login (o navegador o busca sem cookies)", async ({ request }) => {
  const response = await request.get("/motorista/manifest.webmanifest", { maxRedirects: 0 });
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

  const icons = manifest.icons as Array<{ src: string; sizes: string; purpose: string }>;
  expect(icons.filter((icon) => icon.purpose === "any").map((icon) => icon.sizes).sort()).toEqual(["192x192", "512x512"]);
  expect(icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
  for (const icon of icons) {
    const file = await request.get(icon.src);
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()["content-type"], icon.src).toBe("image/png");
  }
});

test("a área do motorista aponta para o manifest; o painel e o login não", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

  await login(page, USERS.motorista);
  await expect(page).toHaveURL(/\/motorista$/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/motorista/manifest.webmanifest");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#14532d");
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(appleIcon ?? "")).status()).toBe(200);
});

test("o service worker é registrado só para a área do motorista", async ({ page, baseURL }) => {
  await login(page, USERS.motorista);
  await expect(page).toHaveURL(/\/motorista$/);

  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, script: ready.active?.scriptURL ?? null };
  });
  expect(registration.scope).toBe(`${baseURL}/motorista`);
  expect(registration.script).toBe(`${baseURL}/serwist/sw.js`);

  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBe(`${baseURL}/serwist/sw.js`);

  // Fora de /motorista o service worker não controla a página. (Sem cookies: logado, o
  // /login mandaria de volta para /motorista.)
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.scope ?? null)).toBeNull();
});

test("o service worker não assume sozinho uma versão nova e não cita rotas de dados", async ({ request }) => {
  const response = await request.get("/serwist/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-cache");
  const source = await response.text();
  expect(source).toContain("SKIP_WAITING");
  expect(source).not.toContain("/api/");
});
