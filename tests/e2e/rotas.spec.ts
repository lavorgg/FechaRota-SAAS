// Rotas e romaneios (seção 5.6). Fluxo do painel da seção 9: montar rota por bairro →
// reordenar → liberar → imprimir os romaneios e validar o conteúdo.
//
// Usa o bairro Vila Tibério, que os outros testes não mexem: 3 pedidos do seed para hoje.

import { type Page, expect, test } from "@playwright/test";

import { USERS, login, sql } from "./helpers";

const VILA = "Selecionar o bairro Vila Tibério (Ribeirão Preto)";

async function stopCustomers(page: Page): Promise<string[]> {
  const texts = await page.getByTestId("parada").allInnerTexts();
  return texts.map((text) => (/nº \d+ (.+)/.exec(text)?.[1] ?? "").trim());
}

async function routeIdByName(name: string): Promise<string> {
  const [row] = await sql<{ id: string }>(`SELECT id FROM "Route" WHERE name = $1 ORDER BY "createdAt" DESC LIMIT 1`, [name]);
  if (!row) throw new Error(`Rota ${name} não encontrada.`);
  return row.id;
}

test("aceite: monta rota por bairro, reordena, libera e imprime os romaneios", async ({ page }, testInfo) => {
  await login(page, USERS.expedicao);
  await page.goto("/app/rotas");
  await expect(page.getByRole("heading", { name: "Rotas", level: 1 })).toBeVisible();

  // Aviso (não bloqueio) de capacidade: Fiorino de 650 kg com os dois "Centro".
  await page.getByRole("checkbox", { name: "Selecionar o bairro Centro (Ribeirão Preto)" }).click();
  await page.getByRole("checkbox", { name: "Selecionar o bairro Centro (Sertãozinho)" }).click();
  await page.getByLabel("Veículo").click();
  await page.getByRole("option", { name: /FRT4B56/ }).click();
  await expect(page.getByText(/acima da capacidade do veículo \(650 kg\)/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Nome da rota" })).toHaveValue("Centro (Ribeirão Preto) / Centro (Sertãozinho)");
  await page.getByRole("button", { name: "Limpar seleção" }).click();

  // Bairro inteiro: 3 pedidos, 134,27 kg, 6 volumes (itens dos pedidos).
  const vila = page.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: VILA }) });
  await expect(vila).toContainText("3 pedidos · 134,27 kg · 6 volumes");
  await page.getByRole("checkbox", { name: VILA }).click();
  await expect(page.getByRole("textbox", { name: "Nome da rota" })).toHaveValue("Vila Tibério");
  await page.getByLabel("Motorista").click();
  await page.getByRole("option", { name: "Marcos Motorista" }).click();
  await page.getByLabel("Veículo").click();
  await page.getByRole("option", { name: /FRT1A23/ }).click();
  await expect(page.getByText(/acima da capacidade/)).toHaveCount(0);
  await page.getByRole("button", { name: "Criar rota com 3 pedidos" }).click();

  await expect(page).toHaveURL(/\/app\/rotas\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: /R-\d{4} · Vila Tibério/ })).toBeVisible();
  await expect(page.getByText("versão 1")).toBeVisible();
  await expect(page.getByText(/ordenação simples, não uma otimização de trajeto/)).toBeVisible();
  // Ordem sugerida: rua e número dentro do bairro.
  expect(await stopCustomers(page)).toEqual(["Açougue Boi Gordo", "Mercadinho Tibério", "Cantina da Escola Dom Pedro"]);
  // Rascunho não imprime.
  await expect(page.getByRole("link", { name: "Romaneio de carga" })).toHaveCount(0);

  // Botão descer.
  await page.getByRole("button", { name: /^Descer parada 1 / }).click();
  await expect(page.getByText("versão 2")).toBeVisible();
  expect(await stopCustomers(page)).toEqual(["Mercadinho Tibério", "Açougue Boi Gordo", "Cantina da Escola Dom Pedro"]);

  // Arrastar pelo teclado (@dnd-kit): espaço pega, seta sobe, espaço solta.
  const liveRegion = page.locator('[id^="DndLiveRegion"]');
  await page.getByRole("button", { name: /^Arrastar parada 3 / }).focus();
  await page.keyboard.press("Space");
  await expect(liveRegion).toContainText("selecionada, na posição 3");
  await page.keyboard.press("ArrowUp");
  await expect(liveRegion).toContainText("sobre a posição 2");
  await page.keyboard.press("Space");
  await expect(page.getByText("versão 3")).toBeVisible();
  expect(await stopCustomers(page)).toEqual(["Mercadinho Tibério", "Cantina da Escola Dom Pedro", "Açougue Boi Gordo"]);

  // Google Maps: parte do depósito e passa pelas paradas na ordem.
  const maps = new URL((await page.getByRole("link", { name: "Abrir rota no Google Maps" }).getAttribute("href")) ?? "");
  expect(`${maps.origin}${maps.pathname}`).toBe("https://www.google.com/maps/dir/");
  expect(maps.searchParams.get("api")).toBe("1");
  expect(maps.searchParams.get("origin")).toBe("Avenida Dom Pedro I, 1500, Ipiranga, Ribeirão Preto - SP, 14075-000");
  expect(maps.searchParams.get("waypoints")).toBe(
    "Rua Luiz da Cunha, 640, Vila Tibério, Ribeirão Preto - SP, 14050-060|Rua Martinico Prado, 97, VILA TIBÉRIO, Ribeirão Preto - SP, 14050-050",
  );
  expect(maps.searchParams.get("destination")).toBe("Rua Coronel Luiz da Silva Batista, 215, Vila Tiberio, Ribeirão Preto - SP, 14050-100");

  await page.getByRole("button", { name: "Liberar para carga" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Liberar para carga" }).click();
  await expect(page.getByText("versão 4")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Liberada para carga");
  await expect(page.getByRole("button", { name: /^Arrastar/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar dados" })).toHaveCount(0);
  // EXPEDICAO não reabre (só ADMIN).
  await expect(page.getByRole("button", { name: "Reabrir rota" })).toHaveCount(0);
  await expect(page.getByText("um administrador precisa reabrir a rota")).toBeVisible();
  const statuses = await sql<{ status: string }>(`SELECT status FROM "Order" WHERE "routeId" = $1`, [await routeIdByName("Vila Tibério")]);
  expect(statuses.map((row) => row.status)).toEqual(["EM_ROTA", "EM_ROTA", "EM_ROTA"]);

  // Romaneio de carga: soma por produto, peso e vasilhames.
  await page.getByRole("link", { name: "Romaneio de carga" }).click();
  const cargo = page.getByRole("article", { name: "Romaneio de carga" });
  await expect(cargo).toContainText("Distribuidora Exemplo");
  await expect(cargo).toContainText(/Rota R-\d{4} · versão 4/);
  await expect(cargo).toContainText("Marcos Motorista");
  await expect(cargo).toContainText("Hyundai HR baú · FRT1A23");
  await expect(cargo).toContainText(/Gerado em\s*\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/i);
  const row = (sku: string) => cargo.getByRole("row").filter({ has: page.getByRole("cell", { name: sku, exact: true }) });
  await expect(row("LEITE-1L")).toHaveText(/LEITE-1L\s*Leite integral 1L\s*UN\s*90\s*94,5 kg/);
  await expect(row("IOG-170")).toHaveText(/IOG-170\s*Iogurte natural 170g\s*UN\s*84\s*15,12 kg/);
  await expect(row("OVOS-DZ")).toHaveText(/OVOS-DZ\s*Ovos brancos \(dúzia\)\s*DZ\s*20\s*14,4 kg/);
  await expect(row("QJ-MUSS")).toHaveText(/QJ-MUSS\s*Queijo muçarela \(kg\)\s*KG\s*10,25\s*10,25 kg/);
  await expect(cargo.getByRole("row", { name: /Total · 3 pedidos/ })).toContainText("134,27 kg");
  // Caixas de 12 leites e de 24 iogurtes, por pedido: (3 + 1) + (5 + 3).
  await expect(row("CAIXA-PLAST").last()).toHaveText(/CAIXA-PLAST\s*Caixa plástica retornável\s*12/);
  await expect(cargo).toContainText("Conferente: nome e assinatura");
  await expect(cargo).toContainText("Motorista: nome e assinatura");

  // Na impressão some a moldura do painel e a barra de imprimir.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: /Imprimir/ })).toBeHidden();
  await expect(page.getByRole("list", { name: "Menu principal" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.pdf({ path: testInfo.outputPath("romaneio-carga.pdf"), format: "A4", preferCSSPageSize: true });

  // Romaneio de entrega: uma seção por parada, na ordem.
  await page.goto(page.url().replace("romaneio-carga", "romaneio-entrega"));
  const delivery = page.getByRole("article", { name: "Romaneio de entrega" });
  const stops = delivery.getByRole("region", { name: /^Parada \d+$/ });
  await expect(stops).toHaveCount(3);
  await expect(stops.nth(0)).toContainText("Parada 1 · Mercadinho Tibério");
  await expect(stops.nth(0)).toContainText("Pedido nº 12");
  await expect(stops.nth(0)).toContainText("Rua Luiz da Cunha, 640, Vila Tibério, Ribeirão Preto - SP, 14050-060");
  await expect(stops.nth(0)).toContainText("(16) 9999-1008");
  await expect(stops.nth(0)).toContainText("Janela: 7h às 12h");
  await expect(stops.nth(0)).toContainText(/Cobrar \(Dinheiro\)\s*R\$\s442,18/);
  await expect(stops.nth(1)).toContainText("Parada 2 · Cantina da Escola Dom Pedro");
  await expect(stops.nth(1)).toContainText("Referência: Entrada pelo portão lateral");
  await expect(stops.nth(1)).toContainText("FATURADO — não cobrar");
  await expect(stops.nth(2)).toContainText("Parada 3 · Açougue Boi Gordo");
  await expect(stops.nth(2)).toContainText(/10,25\s*KG\s*Queijo muçarela/);
  await expect(delivery.getByText("Recebido por (nome legível)")).toHaveCount(3);
  await expect(delivery.getByText(/Saldo de vasilhames/)).toHaveCount(3);
  await page.pdf({ path: testInfo.outputPath("romaneio-entrega.pdf"), format: "A4", preferCSSPageSize: true });
});

test("ADMIN reabre com motivo, mexe nas paradas e exclui o rascunho", async ({ page }) => {
  const routeId = await routeIdByName("Vila Tibério");
  await login(page, USERS.admin);
  await page.goto(`/app/rotas/${routeId}`);
  await page.getByRole("button", { name: "Reabrir rota" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Os romaneios já impressos deixam de valer");
  await dialog.getByLabel("Motivo (opcional)").fill("Cliente pediu para incluir mais itens");
  await dialog.getByRole("button", { name: "Reabrir rota" }).click();
  await expect(page.getByText("versão 5")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Rascunho");
  const statuses = await sql<{ status: string }>(`SELECT status FROM "Order" WHERE "routeId" = $1`, [routeId]);
  expect(statuses.map((row) => row.status)).toEqual(["PENDENTE", "PENDENTE", "PENDENTE"]);
  const [audit] = await sql<{ reason: string }>(`SELECT reason FROM "AuditLog" WHERE "entityId" = $1 AND action = 'ROTA_REABERTA'`, [routeId]);
  expect(audit?.reason).toBe("Cliente pediu para incluir mais itens");

  // Em rascunho, o romaneio não sai nem pelo endereço direto.
  await page.goto(`/app/rotas/${routeId}/romaneio-carga`);
  await expect(page.getByText("Os romaneios só podem ser impressos depois que a rota é liberada para carga.")).toBeVisible();
  await page.goto(`/app/rotas/${routeId}`);

  // Tira um pedido e devolve pelo agrupador da própria rota.
  await page.getByRole("button", { name: "Tirar o pedido nº 14 da rota" }).click();
  await expect(page.getByText("versão 6")).toBeVisible();
  await expect(page.getByTestId("parada")).toHaveCount(2);
  await page.getByRole("checkbox", { name: VILA }).click();
  await page.getByRole("button", { name: "Adicionar 1 pedido" }).click();
  await expect(page.getByText("versão 7")).toBeVisible();
  await expect(page.getByTestId("parada")).toHaveCount(3);
  expect((await stopCustomers(page))[2]).toBe("Cantina da Escola Dom Pedro");

  // Excluir: pedidos voltam para "sem rota".
  const orderIds = (await sql<{ id: string }>(`SELECT id FROM "Order" WHERE "routeId" = $1`, [routeId])).map((row) => row.id);
  await page.getByRole("button", { name: "Excluir rascunho" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir rascunho" }).click();
  await expect(page).toHaveURL(/\/app\/rotas\?data=/);
  await expect(page.getByRole("checkbox", { name: VILA })).toBeVisible();
  expect(await sql(`SELECT id FROM "Route" WHERE id = $1`, [routeId])).toEqual([]);
  const orders = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM "Order" WHERE id = ANY($1) AND "routeId" IS NULL AND "stopSequence" IS NULL AND status = 'PENDENTE'`, [orderIds]);
  expect(orders[0]?.n).toBe("3");
  expect(await sql(`SELECT action FROM "AuditLog" WHERE "entityId" = $1 ORDER BY "createdAt"`, [routeId])).toEqual([
    { action: "ROTA_LIBERADA" },
    { action: "ROTA_REABERTA" },
    { action: "ROTA_EXCLUIDA" },
  ]);
});

test("Empresa: só ADMIN; endereço do depósito incompleto é recusado", async ({ page }) => {
  await login(page, USERS.expedicao);
  await page.goto("/app/empresa");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await page.context().clearCookies();

  await login(page, USERS.admin);
  await page.goto("/app/empresa");
  await expect(page.getByLabel("Rua")).toHaveValue("Avenida Dom Pedro I");
  await page.getByLabel("Número").fill("");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Preencha o endereço completo do depósito ou deixe tudo vazio.")).toBeVisible();

  await page.getByLabel("Número").fill("1600");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Dados da empresa salvos.")).toBeVisible();
  const [company] = await sql<{ depotNumber: string }>(`SELECT "depotNumber" FROM "Company" WHERE name = 'Distribuidora Exemplo'`);
  expect(company?.depotNumber).toBe("1600");
});

test("motorista não chega às rotas do painel", async ({ page }) => {
  await login(page, USERS.motorista);
  await page.goto("/app/rotas");
  await expect(page).toHaveURL(/\/motorista$/);
});
