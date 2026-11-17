// Aceite da Fase 2: cada papel vê apenas o que a matriz da seção 5.1 permite.

import { type Page, expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

async function menuItems(page: Page): Promise<string[]> {
  return page.getByRole("list", { name: "Menu principal" }).getByRole("link").allInnerTexts();
}

test("ADMIN: menu completo; acessa também a área do motorista", async ({ page }) => {
  await login(page, USERS.admin);
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  expect(await menuItems(page)).toEqual(["Dashboard", "Pedidos", "Clientes", "Produtos", "Veículos", "Usuários"]);

  const users = await page.goto("/app/usuarios");
  expect(users?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();

  await page.goto("/motorista");
  await expect(page).toHaveURL(/\/motorista$/);
  await expect(page.getByRole("heading", { name: "Suas rotas de hoje" })).toBeVisible();
});

test("EXPEDICAO: sem usuários no menu, /app/usuarios não existe e não entra na área do motorista", async ({ page }) => {
  await login(page, USERS.expedicao);
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  expect(await menuItems(page)).toEqual(["Dashboard", "Pedidos", "Clientes", "Produtos", "Veículos"]);

  // O painel tem estado de carregamento (streaming): a página responde 200 e mostra o
  // "não encontrada" sem nenhum dado de usuários.
  await page.goto("/app/usuarios");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usuários" })).toHaveCount(0);
  await expect(page.getByText(USERS.admin)).toHaveCount(0);
  await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();

  await page.goto("/motorista");
  await expect(page).toHaveURL(/\/app\/dashboard$/);
});

test("MOTORISTA: não entra no painel", async ({ page }) => {
  await login(page, USERS.motorista);
  await expect(page).toHaveURL(/\/motorista$/);
  for (const path of ["/app", "/app/dashboard", "/app/usuarios"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/motorista$/);
  }
});

test("a troca rápida de perfil não existe no build de produção", async ({ page }) => {
  for (const email of [USERS.admin, USERS.motorista]) {
    await login(page, email);
    await expect(page.getByRole("button", { name: /Trocar perfil/ })).toHaveCount(0);
    await page.context().clearCookies();
  }
});
