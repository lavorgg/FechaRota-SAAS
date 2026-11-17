// O painel é usado no computador, mas não pode quebrar no celular (seção 5.2 e regra de
// layout: nada de rolagem horizontal na largura de um telefone).

import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

for (const path of ["/app/dashboard", "/app/usuarios"]) {
  test(`sem rolagem horizontal em ${path} a 390px`, async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("no celular o menu lateral abre como gaveta", async ({ page }) => {
  await login(page, USERS.admin);
  await page.getByRole("button", { name: "Recolher ou abrir o menu" }).click();
  await expect(page.getByRole("link", { name: "Usuários" })).toBeVisible();
});
