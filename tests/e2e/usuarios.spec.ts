// Gestão de usuários (seção 5.1) e painel somente leitura com pagamento pendente (seção 4).

import { expect, test } from "@playwright/test";

import { USERS, login, sql } from "./helpers";

test("ADMIN cadastra um motorista, que entra direto na área do motorista", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/usuarios");
  await page.getByRole("button", { name: "Novo usuário" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill("Rui Rodrigues");
  await dialog.getByLabel("E-mail").fill("Rui.Rodrigues@Exemplo.test");
  await dialog.getByLabel("Telefone (opcional)").fill("(16) 99876-5432");
  await dialog.getByLabel("Senha inicial").fill("senha-do-rui");
  await dialog.getByRole("button", { name: "Cadastrar" }).click();

  await expect(page.getByText("Rui Rodrigues cadastrado.")).toBeVisible();
  const row = page.getByRole("row", { name: /Rui Rodrigues/ });
  await expect(row).toContainText("rui.rodrigues@exemplo.test");
  await expect(row).toContainText("(16) 99876-5432");
  await expect(row).toContainText("Motorista");

  await page.context().clearCookies();
  await login(page, "rui.rodrigues@exemplo.test", "senha-do-rui");
  await expect(page).toHaveURL(/\/motorista$/);
});

test("erros de validação aparecem embaixo de cada campo", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/usuarios");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Telefone (opcional)").fill("123");
  await dialog.getByLabel("Senha inicial").fill("curta");
  await dialog.getByRole("button", { name: "Cadastrar" }).click();
  await expect(dialog.getByText("Informe o nome.")).toBeVisible();
  await expect(dialog.getByText("Telefone inválido. Informe DDD e número.")).toBeVisible();
  await expect(dialog.getByText("A senha deve ter pelo menos 8 caracteres.")).toBeVisible();
});

test("ADMIN não pode desativar a si mesmo e desativa outro usuário", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/usuarios");

  await page.getByRole("button", { name: "Ações para Ana Administradora" }).click();
  await expect(page.getByRole("menuitem", { name: "Desativar" })).toHaveAttribute("data-disabled", "");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Ações para Mário Motorista" }).click();
  await page.getByRole("menuitem", { name: "Desativar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Desativar" }).click();
  await expect(page.getByText("Mário Motorista desativado.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Mário Motorista/ })).toContainText("Desativado");

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("motorista2@exemplo.test");
  await page.getByLabel("Senha").fill("fecharota123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Este usuário está desativado. Fale com o administrador da empresa.")).toBeVisible();
});

test("plano em atraso: aviso no topo e nenhuma alteração permitida", async ({ page }) => {
  await sql(`UPDATE "Company" SET "planStatus" = 'PAST_DUE' WHERE name = 'Distribuidora Vizinha'`);
  try {
    await login(page, USERS.adminVizinha);
    await expect(page.getByRole("status")).toContainText("Sua conta está com pagamento pendente.");
    await page.goto("/app/usuarios");
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo usuário" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Ações para Valdir Motorista" })).toBeDisabled();
  } finally {
    await sql(`UPDATE "Company" SET "planStatus" = 'TRIAL' WHERE name = 'Distribuidora Vizinha'`);
  }
});
