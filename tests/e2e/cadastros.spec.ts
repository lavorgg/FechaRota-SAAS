// Cadastros (seção 5.4): veículos, produtos e clientes, com busca de CEP.

import { type Page, expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

const VIACEP = "https://viacep.com.br/ws/**";
const cors = { "access-control-allow-origin": "*" };

async function asExpedicao(page: Page) {
  await login(page, USERS.expedicao);
}

test("menu da expedição tem os cadastros", async ({ page }) => {
  await asExpedicao(page);
  const menu = page.getByRole("list", { name: "Menu principal" });
  await expect(menu.getByRole("link")).toHaveText(["Dashboard", "Pedidos", "Clientes", "Produtos", "Veículos"]);
});

test("veículo: cadastra, recusa placa repetida e inativa", async ({ page }) => {
  await asExpedicao(page);
  await page.goto("/app/veiculos");
  await page.getByRole("button", { name: "Novo veículo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Placa").fill("eee-1a23");
  await dialog.getByLabel("Modelo").fill("Iveco Daily");
  await dialog.getByLabel("Capacidade em kg (opcional)").fill("3500");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: /EEE1A23/ })).toContainText("3.500 kg");

  await page.getByRole("button", { name: "Novo veículo" }).click();
  await dialog.getByLabel("Placa").fill("EEE1A23");
  await dialog.getByLabel("Modelo").fill("Outro");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog.getByText("Já existe um veículo com esta placa.").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Ações para EEE1A23" }).click();
  await page.getByRole("menuitem", { name: "Inativar" }).click();
  await expect(page.getByText("Veículo inativado.")).toBeVisible();
  await expect(page.getByRole("row", { name: /EEE1A23/ })).toHaveCount(0);
});

test("produto: preço em reais, vasilhame e busca sem acento", async ({ page }) => {
  await asExpedicao(page);
  await page.goto("/app/produtos");
  await page.getByRole("button", { name: "Novo produto" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("SKU").fill("req-200");
  await dialog.getByLabel("Nome").fill("Requeijão cremoso 200g");
  await dialog.getByLabel("Preço (R$)").fill("8,9");
  await dialog.getByLabel("Peso por unidade (kg)").fill("0,22");
  await dialog.getByRole("combobox", { name: "Sai no vasilhame" }).click();
  await page.getByRole("option", { name: /CAIXA-PLAST/ }).click();
  await dialog.getByLabel("Unidades por vasilhame").fill("24");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Produto cadastrado.")).toBeVisible();

  await page.getByLabel("Buscar por SKU ou nome").fill("requeijao");
  await page.getByRole("button", { name: "Buscar" }).click();
  const row = page.getByRole("row", { name: /REQ-200/ });
  await expect(row).toContainText("R$ 8,90");
  await expect(row).toContainText("CAIXA-PLAST (24/vasilhame)");
});

test("cliente: Buscar CEP preenche o endereço e o cadastro salva", async ({ page }) => {
  await page.route(VIACEP, (route) =>
    route.fulfill({ headers: cors, json: { cep: "14025-000", logradouro: "Avenida Nove de Julho", bairro: "Jardim Sumaré", localidade: "Ribeirão Preto", uf: "SP" } }),
  );
  await asExpedicao(page);
  await page.goto("/app/clientes/novo");
  await page.getByLabel("Nome (como é conhecido)").fill("Quitanda Sumaré");
  await page.getByLabel("Telefone / WhatsApp (opcional)").fill("(16) 99123-4567");
  await page.getByLabel("CEP").fill("14025-000");
  await page.getByRole("button", { name: "Buscar CEP" }).click();
  await expect(page.getByLabel("Rua")).toHaveValue("Avenida Nove de Julho");
  await expect(page.getByLabel("Bairro")).toHaveValue("Jardim Sumaré");
  await expect(page.getByLabel("Número")).toBeFocused();
  await page.getByLabel("Número").fill("2000");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText("Cliente cadastrado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quitanda Sumaré" })).toBeVisible();

  await page.goto("/app/clientes?q=sumare");
  await expect(page.getByRole("row", { name: /Quitanda Sumaré/ })).toContainText("(16) 99123-4567");
});

test("cliente: CEP fora do ar não bloqueia o cadastro", async ({ page }) => {
  await page.route(VIACEP, (route) => route.abort("failed"));
  await asExpedicao(page);
  await page.goto("/app/clientes/novo");
  await page.getByLabel("CEP").fill("14025-000");
  await page.getByRole("button", { name: "Buscar CEP" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preencha o endereço à mão." })).toBeVisible();
  await page.getByLabel("Nome (como é conhecido)").fill("Cliente Manual");
  await page.getByLabel("Rua").fill("Rua Manual");
  await page.getByLabel("Número").fill("1");
  await page.getByLabel("Bairro").fill("Centro");
  await page.getByLabel("Cidade").fill("Ribeirão Preto");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText("Cliente cadastrado.")).toBeVisible();
});

test("cliente: CPF/CNPJ inválido e repetido", async ({ page }) => {
  await asExpedicao(page);
  await page.goto("/app/clientes/novo");
  await page.getByLabel("Nome (como é conhecido)").fill("Documento Ruim");
  await page.getByLabel("CPF ou CNPJ (opcional)").fill("111.111.111-11");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText("CPF inválido.")).toBeVisible();
});

test("pedido recorrente do cliente: cria e pausa", async ({ page }) => {
  await asExpedicao(page);
  await page.goto("/app/clientes?q=zeca");
  await page.getByRole("link", { name: "Bar do Zeca" }).click();
  await page.getByRole("button", { name: "Novo pedido recorrente" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Dia da semana" }).click();
  await page.getByRole("option", { name: "Sexta-feira" }).click();
  await dialog.getByRole("combobox", { name: "Buscar produto" }).fill("CERV-600");
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Recorrente criado.")).toBeVisible();

  const card = page.getByRole("listitem", { name: "Recorrente de Sexta-feira" });
  await expect(card).toContainText("Ativo");
  await card.getByRole("button", { name: "Pausar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Pausar" }).click();
  await expect(card).toContainText(/Pausado até/);
  await card.getByRole("button", { name: "Retomar" }).click();
  await expect(card).toContainText("Ativo");
});

test("motorista não acessa cadastros", async ({ page }) => {
  await login(page, USERS.motorista);
  for (const path of ["/app/clientes", "/app/produtos", "/app/veiculos"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/motorista$/);
  }
});
