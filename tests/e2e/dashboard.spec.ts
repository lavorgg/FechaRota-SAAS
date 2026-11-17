// Dashboard (seção 5.3) com os dados do seed, e o seletor de data global (seção 5.2).

import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Só o que está visível: na troca de data, a página anterior fica um instante no DOM, escondida.
function card(page: import("@playwright/test").Page, label: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: label, visible: true });
}

test("hoje: 12 pedidos pendentes e os alertas do seed", async ({ page }) => {
  await login(page, USERS.admin);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(card(page, "Pedidos do dia")).toContainText("12");
  await expect(card(page, "Recebido (dinheiro + Pix conferido)")).toContainText("R$ 0,00");
  await expect(page.getByText("Pedidos recorrentes de")).toBeVisible();
  await expect(page.getByText("Bar e Mercearia do Tonho")).toBeVisible();
  await expect(page.getByText("Pedidos pendentes desta data sem rota")).toBeVisible();
  await expect(page.getByText(/Pedido nº 4 · Lanchonete Ponto Certo/)).toBeVisible();
  // O painel não fala em "faturamento" (seção 5.3).
  await expect(page.getByText(/faturamento/i)).toHaveCount(0);
});

test("dia anterior: rota concluída, dinheiro e Pix recebidos", async ({ page }) => {
  await login(page, USERS.expedicao);
  await page.getByRole("button", { name: "Dia anterior" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard\?data=\d{4}-\d{2}-\d{2}$/);
  await expect(card(page, "Pedidos do dia")).toContainText("4");
  await expect(card(page, "Recebido (dinheiro + Pix conferido)")).toContainText("R$ 666,46");
  await expect(card(page, "Recebido (dinheiro + Pix conferido)")).toContainText("Dinheiro R$ 250,76 · Pix R$ 415,70");
  await expect(card(page, "A receber na entrega")).toContainText("R$ 822,61");
  await expect(card(page, "Entregas")).toContainText("Concluídas3");

  await page.getByRole("button", { name: "Hoje" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(card(page, "Pedidos do dia")).toContainText("12");
});

test("data inválida na URL cai para hoje", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/dashboard?data=2026-02-30");
  await expect(card(page, "Pedidos do dia")).toContainText("12");
});

test("a outra empresa não vê os dados da Distribuidora Exemplo", async ({ page }) => {
  await login(page, USERS.adminVizinha);
  await expect(card(page, "Pedidos do dia")).toContainText("2");
  await expect(page.getByText("Bar e Mercearia do Tonho")).toHaveCount(0);
  await expect(page.getByText(/Lanchonete Ponto Certo/)).toHaveCount(0);
});
