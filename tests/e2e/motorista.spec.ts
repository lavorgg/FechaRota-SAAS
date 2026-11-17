// Área do motorista no celular (seção 5.2): layout próprio, alvos de toque grandes e saída.

import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

test("motorista entra direto na própria área e vê o estado vazio de hoje", async ({ page }) => {
  await login(page, USERS.motorista);
  await expect(page).toHaveURL(/\/motorista$/);
  await expect(page.getByRole("heading", { name: "Suas rotas de hoje" })).toBeVisible();
  await expect(page.getByText("Nenhuma rota atribuída a você hoje.")).toBeVisible();
  await expect(page.getByText("Marcos Motorista")).toBeVisible();
  await expect(page.getByText("Distribuidora Exemplo")).toBeVisible();
});

test("botão Sair tem pelo menos 48×48px e encerra a sessão", async ({ page }) => {
  await login(page, USERS.motorista);
  const logout = page.getByRole("button", { name: "Sair" });
  const box = await logout.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(48);
  expect(box?.width).toBeGreaterThanOrEqual(48);
  await logout.click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/motorista");
  await expect(page).toHaveURL(/\/login\?proximo=%2Fmotorista$/);
});

test("fonte base de pelo menos 16px", async ({ page }) => {
  await login(page, USERS.motorista);
  const size = await page.locator("main p").first().evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});
