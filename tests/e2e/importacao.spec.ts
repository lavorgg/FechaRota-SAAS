// Importação por CSV (seção 5.4): modelo, pré-visualização, lotes e relatório.

import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

test("modelo de produtos para download, com BOM e separador ;", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/produtos/importar");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar modelo" }).click()]);
  expect(download.suggestedFilename()).toBe("modelo-produtos.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text.slice(1).split("\r\n")[0]).toBe("sku;nome;unidade;preco;peso_kg;retornavel;sku_vasilhame;unidades_por_vasilhame");
});

test("produtos: arquivo do Excel (Windows-1252, ;), pré-visualização e relatório", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/produtos/importar");
  const csv = [
    "SKU;Nome;Unidade;Preço;peso_kg;retornavel;sku_vasilhame;unidades_por_vasilhame",
    "BALDE-E2E;Balde retornável;UN;15,00;;sim;;",
    "MANT-E2E;Manteiga em balde;KG;38,50;1;não;BALDE-E2E;5",
    "LEITE-1L;Já existe;UN;1,00;;não;;",
    "RUIM-E2E;Preço ruim;UN;abc;;não;;",
  ].join("\r\n");
  // "Preço" e acentos em Windows-1252, como o Excel em português salva.
  await page.getByLabel("Arquivo CSV").setInputFiles({ name: "produtos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "latin1") });

  await expect(page.getByText("3 linhas válidas · 1 com erro")).toBeVisible();
  await expect(page.getByRole("row", { name: /RUIM-E2E/ })).toContainText("preco: Valor inválido. Use o formato 12,50.");
  await page.getByRole("button", { name: "Importar 3 linhas" }).click();

  await expect(page.getByText("2 registros importados, 2 linhas recusadas.")).toBeVisible();
  await expect(page.getByRole("row", { name: /^4 / })).toContainText("sku: LEITE-1L já cadastrado.");
  await expect(page.getByRole("row", { name: /^5 / })).toContainText("preco: Valor inválido.");

  await page.goto("/app/produtos?q=e2e");
  await expect(page.getByRole("row", { name: /MANT-E2E/ })).toContainText("BALDE-E2E (5/vasilhame)");
});

test("clientes: cabeçalho sem coluna obrigatória é recusado antes de enviar", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/clientes/importar");
  await page.getByLabel("Arquivo CSV").setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from("nome;cidade\nX;Y\n") });
  await expect(page.getByText(/Colunas obrigatórias ausentes no cabeçalho: cep, rua, numero, bairro, uf, forma_pagamento\./)).toBeVisible();
  await expect(page.getByRole("button", { name: /Importar/ })).toHaveCount(0);
});

test("clientes: importa e o cliente aparece na busca do lançamento", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/app/clientes/importar");
  const csv = [
    "nome,documento,cep,rua,numero,bairro,cidade,uf,forma_pagamento,telefone",
    'Armazém Importado,,14010-000,"Rua A, fundos",10,Centro,Ribeirão Preto,SP,Pix,(16) 99000-1111',
    "Duplicado do seed,40.001.111/0001-37,14010-000,Rua B,20,Centro,Ribeirão Preto,SP,Dinheiro,",
  ].join("\n");
  await page.getByLabel("Arquivo CSV").setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await expect(page.getByText("2 linhas válidas · 0 com erro")).toBeVisible();
  await page.getByRole("button", { name: "Importar 2 linhas" }).click();
  await expect(page.getByText("1 registro importado, 1 linha recusada.")).toBeVisible();
  await expect(page.getByRole("row", { name: /^3 / })).toContainText("documento: CPF/CNPJ já cadastrado.");

  await page.goto("/app/pedidos");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("n");
  await page.keyboard.type("armazem");
  await expect(page.getByRole("option", { name: /Armazém Importado/ })).toBeVisible();
});
