// Pedidos (seção 5.5). Inclui o aceite da Fase 3: pedido de 5 itens só com o teclado em
// menos de 30 segundos.

import { type Page, expect, test } from "@playwright/test";

import { USERS, login, sql } from "./helpers";

async function openPedidos(page: Page) {
  await login(page, USERS.expedicao);
  await page.goto("/app/pedidos");
  await page.waitForLoadState("networkidle");
}

async function pickCustomer(page: Page, query: string, name: RegExp) {
  await page.keyboard.type(query);
  await page.getByRole("option", { name }).click();
  await expect(page.getByRole("combobox", { name: "Buscar produto" })).toBeFocused();
}

async function addItem(page: Page, sku: string, quantity: string) {
  await page.keyboard.type(sku);
  await expect(page.getByRole("option", { name: new RegExp(sku) })).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.type(quantity);
  await page.keyboard.press("Enter");
}

test("aceite: pedido de 5 itens só com o teclado em menos de 30 segundos", async ({ page }) => {
  await openPedidos(page);
  const started = Date.now();

  await page.keyboard.press("n");
  await expect(page.getByRole("combobox", { name: "Buscar cliente" })).toBeFocused();
  await page.keyboard.type("tonho");
  await expect(page.getByRole("option", { name: /Bar e Mercearia do Tonho/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Buscar produto" })).toBeFocused();

  await addItem(page, "LEITE-1L", "24");
  await addItem(page, "QJ-MUSS", "2,5");
  await addItem(page, "CERV-600-CX", "3");
  await addItem(page, "OVOS-DZ", "10");
  await addItem(page, "IOG-170", "48");
  await expect(page.getByTestId("total-pedido")).toHaveText("R$ 932,93");

  await page.keyboard.press("Control+Enter");
  await expect(page.getByText(/Pedido nº \d+ lançado · R\$\s932,93/)).toBeVisible();
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(30_000);

  // A gaveta fica pronta para o próximo pedido, com o foco na busca de cliente.
  await expect(page.getByRole("combobox", { name: "Buscar cliente" })).toBeFocused();

  // O servidor gravou o mesmo total (preço do cadastro, não do navegador).
  const [order] = await sql<{ totalCents: number; items: string }>(
    `SELECT o."totalCents", count(i.id)::text AS items FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id
      JOIN "Customer" c ON c.id = o."customerId" WHERE c.name = 'Bar e Mercearia do Tonho' GROUP BY o.id ORDER BY o."createdAt" DESC LIMIT 1`,
  );
  expect(order).toEqual({ totalCents: 93293, items: "5" });
});

test("segundo pedido do cliente no mesmo dia pede confirmação", async ({ page }) => {
  await openPedidos(page);
  await page.getByRole("button", { name: /Novo pedido/ }).click();
  await pickCustomer(page, "pao quente", /Padaria Pão Quente/);
  await expect(page.getByText(/Já tem pedido nº \d+ para/)).toBeVisible();
  await addItem(page, "LEITE-1L", "6");
  await page.getByRole("button", { name: "Lançar pedido" }).click();

  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Este cliente já tem o pedido nº");
  await confirm.getByRole("button", { name: "Lançar mesmo assim" }).click();
  await expect(page.getByText(/Pedido nº \d+ lançado/)).toBeVisible();
});

test("repetir último pedido traz os itens do último pedido do cliente", async ({ page }) => {
  await openPedidos(page);
  await page.getByRole("button", { name: /Novo pedido/ }).click();
  await pickCustomer(page, "zeca", /Bar do Zeca/);
  await page.getByRole("button", { name: "Repetir último pedido" }).click();
  const items = page.getByRole("list", { name: "Itens" });
  await expect(items).toContainText("Cerveja 600ml caixa c/ 24");
  await expect(items).toContainText("Refrigerante 2L fardo c/ 6");
  await expect(page.getByTestId("total-pedido")).toHaveText("R$ 647,80");
});

test("quantidade fracionada em produto que não é KG é barrada antes de salvar", async ({ page }) => {
  await openPedidos(page);
  await page.getByRole("button", { name: /Novo pedido/ }).click();
  await pickCustomer(page, "tonho", /Tonho/);
  await addItem(page, "LEITE-1L", "1,5");
  await expect(page.getByRole("list", { name: "Itens" }).getByRole("alert")).toHaveText("Quantidade em UN deve ser um número inteiro.");
  await page.getByRole("button", { name: "Lançar pedido" }).click();
  await expect(page.getByText("Confira os itens destacados.").first()).toBeVisible();
});

test("editar pedido pendente muda o total; cancelar exige motivo", async ({ page }) => {
  await openPedidos(page);
  const row = page.getByRole("row", { name: /Empório Jardim/ });
  await row.getByRole("button", { name: /Ações do pedido/ }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: /Editar pedido nº \d+/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Quantidade de Ovos brancos (dúzia)" }).fill("12");
  await page.getByRole("button", { name: "Salvar pedido" }).click();
  await expect(page.getByText(/Pedido nº \d+ salvo/)).toBeVisible();
  // 24 iogurtes × 3,29 + 12 dúzias × 11,90 = 78,96 + 142,80
  await expect(row).toContainText("R$ 221,76");

  await row.getByRole("button", { name: /Ações do pedido/ }).click();
  await page.getByRole("menuitem", { name: "Cancelar pedido" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(dialog.getByText("Informe o motivo do cancelamento.")).toBeVisible();
  await dialog.getByLabel("Motivo").fill("Cliente fechou para reforma");
  await dialog.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(row).toContainText("Cancelado");
  await expect(row).toContainText("motivo: Cliente fechou para reforma");
});

test("reagendar pedido não entregue cria pedido novo e o original continua não entregue", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/dashboard");
  await page.getByRole("button", { name: "Dia anterior" }).click();
  await expect(page).toHaveURL(/data=/);
  const yesterday = new URL(page.url()).searchParams.get("data");
  await page.goto(`/app/pedidos?data=${yesterday}`);
  const row = page.getByRole("row", { name: /Lanchonete Ponto Certo/ });
  await expect(row).toContainText("Não entregue");
  await row.getByRole("button", { name: /Ações do pedido/ }).click();
  await page.getByRole("menuitem", { name: "Reagendar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reagendar" }).click();
  await expect(page.getByText(/Pedido nº \d+ criado para/)).toBeVisible();
  await expect(row).toContainText(/reagendado no nº \d+/);
  await expect(row).toContainText("Não entregue");
  // Não dá para reagendar de novo.
  await expect(row.getByRole("button", { name: /Ações do pedido/ })).toBeDisabled();
});

test("filtro por bairro agrupa grafias diferentes do mesmo bairro", async ({ page }) => {
  await openPedidos(page);
  await page.getByLabel("Bairro").selectOption({ label: "Centro · Ribeirão Preto" });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/bairro=ribeirao/);
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "Bar do Zeca" }).first()).toBeVisible();
  await expect(rows.filter({ hasText: "Mercearia Santa Rita" }).first()).toBeVisible();
  await expect(rows.filter({ hasText: "Empório Jardim" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "Supermercado Bom Preço" })).toHaveCount(0);
});

test("gerador de recorrentes: pelo dashboard cria o pedido; rodar de novo não duplica", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/dashboard");
  await page.getByRole("button", { name: /Gerar recorrentes para/ }).click();
  const result = page.getByRole("dialog");
  await expect(result).toContainText("1 pedido criado, 1 já existia, 0 ignorados.");
  await expect(result).toContainText("Bar e Mercearia do Tonho");
  await result.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByText("Bar e Mercearia do Tonho")).toHaveCount(0);

  await page.goto("/app/pedidos");
  await page.getByRole("button", { name: /Gerar recorrentes para/ }).click();
  await expect(page.getByRole("dialog")).toContainText("0 pedidos criados, 2 já existiam, 0 ignorados.");
});

test("motorista não chega aos pedidos", async ({ page }) => {
  await login(page, USERS.motorista);
  await page.goto("/app/pedidos");
  await expect(page).toHaveURL(/\/motorista$/);
});
