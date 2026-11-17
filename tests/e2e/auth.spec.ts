// Login, sessão, logout e cadastro de empresa (seção 5.1).

import { expect, test } from "@playwright/test";

import { PASSWORD, USERS, login, sql } from "./helpers";

test("sem login, o painel manda para o login e volta para a página pedida", async ({ page }) => {
  await page.goto("/app/usuarios");
  await expect(page).toHaveURL(/\/login\?proximo=%2Fapp%2Fusuarios$/);
  await page.getByLabel("E-mail").fill(USERS.admin);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app\/usuarios$/);
});

test("destino externo no ?proximo= é ignorado", async ({ page }) => {
  await page.goto("/login?proximo=https%3A%2F%2Fgolpe.example%2Fapp");
  await page.getByLabel("E-mail").fill(USERS.admin);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
});

test("senha errada mostra mensagem genérica e limpa a senha", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(USERS.admin);
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page.getByLabel("Senha")).toHaveValue("");
  await expect(page).toHaveURL(/\/login$/);
});

test("validação no navegador antes de enviar", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Informe o e-mail.")).toBeVisible();
  await expect(page.getByText("Informe a senha.")).toBeVisible();
});

test("depois de 10 tentativas o login fica bloqueado para aquele e-mail", async ({ page }) => {
  const email = "bloqueio@exemplo.test";
  await page.goto("/login");
  for (let i = 0; i < 10; i++) {
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(`errada-${i}`);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  }
  await page.getByLabel("Senha").fill("mais-uma");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Muitas tentativas de login\. Tente de novo em 1[45] minutos\./)).toBeVisible();
});

test("cookie de sessão: HttpOnly, Secure, SameSite=Lax e prefixo __Host-", async ({ page, context }) => {
  await login(page, USERS.admin);
  const cookie = (await context.cookies()).find((c) => c.name === "__Host-fecharota-sessao");
  expect(cookie).toBeDefined();
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  // Sessão do painel: 12 horas.
  const hours = ((cookie?.expires ?? 0) * 1000 - Date.now()) / 3600_000;
  expect(hours).toBeGreaterThan(11.9);
  expect(hours).toBeLessThanOrEqual(12);
  // Nada da sessão fica acessível ao JavaScript da página.
  expect(await page.evaluate(() => document.cookie)).not.toContain("fecharota-sessao");
});

test("sair encerra a sessão no servidor", async ({ page, context, playwright, baseURL }) => {
  await login(page, USERS.admin);
  const token = (await context.cookies()).find((c) => c.name === "__Host-fecharota-sessao")?.value ?? "";
  expect(token).not.toBe("");
  await page.getByRole("button", { name: "Ana Administradora" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Mesmo reenviando o cookie antigo, a sessão não existe mais no servidor.
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie: `__Host-fecharota-sessao=${token}` } });
  const response = await api.get("/app/dashboard");
  expect(response.url()).toMatch(/\/login$/);
  await api.dispose();
});

test("cadastro de empresa cria o ADMIN e entra no dashboard vazio", async ({ page }) => {
  await page.goto("/cadastro");
  await page.getByLabel("Nome da empresa").fill("Hortifrúti Teste E2E");
  await page.getByLabel("CNPJ (opcional)").fill("11.444.777/0001-61");
  await page.getByLabel("Seu nome").fill("Helena Horta");
  await page.getByLabel("E-mail").fill("helena@horti-e2e.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-da-helena");
  await page.getByLabel("Repita a senha").fill("senha-da-helena");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(page.getByText("Hortifrúti Teste E2E")).toBeVisible();
  await expect(page.getByText("Nenhum alerta para esta data.")).toBeVisible();

  const rows = await sql<{ planStatus: string; role: string; days: number }>(
    `SELECT c."planStatus", u.role, ROUND(EXTRACT(EPOCH FROM (c."trialEndsAt" - c."createdAt")) / 86400) AS days
       FROM "Company" c JOIN "User" u ON u."companyId" = c.id WHERE u.email = $1`,
    ["helena@horti-e2e.test"],
  );
  expect(rows).toEqual([{ planStatus: "TRIAL", role: "ADMIN", days: "14" }]);
});

test("cadastro com e-mail já usado mostra o erro no campo", async ({ page }) => {
  await page.goto("/cadastro");
  await page.getByLabel("Nome da empresa").fill("Outra Empresa");
  await page.getByLabel("Seu nome").fill("Alguém");
  await page.getByLabel("E-mail").fill(USERS.admin);
  await page.getByLabel("Senha", { exact: true }).fill("senha-qualquer");
  await page.getByLabel("Repita a senha").fill("senha-qualquer");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Este e-mail já está em uso.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/cadastro$/);
});
