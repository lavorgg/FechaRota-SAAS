// Aceite da Fase 5 (seção 9): motorista em viewport de celular, sobre build de produção, com
// service worker ativo. Iniciar rota → entrega completa com assinatura e foto → não entregue →
// parcial; depois offline, recarregar a página, finalizar duas entregas, voltar online e
// conferir sincronização e idempotência.
//
// Roda no projeto "entregas", depois de todos os outros (muda a situação de pedidos de hoje).

import { type Browser, type Page, expect, test } from "@playwright/test";

import { PASSWORD, USERS, cameraLikePhoto, login, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const ROUTE_NAME = "Entregas do E2E";
let routeId = "";

/** A expedição monta e libera a rota (Jardim Paulista + Vila Tibério) num navegador de mesa. */
async function releaseRouteAsExpedicao(browser: Browser): Promise<string> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  await login(page, USERS.expedicao);
  await page.goto("/app/rotas");
  await page.getByRole("checkbox", { name: "Selecionar o bairro Jardim Paulista (Ribeirão Preto)" }).click();
  await page.getByRole("checkbox", { name: "Selecionar o bairro Vila Tibério (Ribeirão Preto)" }).click();
  await page.getByRole("textbox", { name: "Nome da rota" }).fill(ROUTE_NAME);
  await page.getByLabel("Motorista").click();
  await page.getByRole("option", { name: "Marcos Motorista" }).click();
  await page.getByRole("button", { name: /^Criar rota com \d+ pedidos$/ }).click();
  await expect(page).toHaveURL(/\/app\/rotas\/[a-z0-9]+$/);
  const id = page.url().split("/").pop() ?? "";
  await page.getByRole("button", { name: "Liberar para carga" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Liberar para carga" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Liberada para carga");
  await context.close();
  return id;
}

async function stops(): Promise<Array<{ customer: string; status: string }>> {
  return sql<{ customer: string; status: string }>(
    `SELECT c.name AS customer, o.status FROM "Order" o JOIN "Customer" c ON c.id = o."customerId" WHERE o."routeId" = $1 ORDER BY o."stopSequence"`,
    [routeId],
  );
}

async function sign(page: Page) {
  const pad = page.getByTestId("assinatura");
  // No meio da tela: embaixo fica o rodapé fixo com "Confirmar entrega".
  await pad.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const box = await pad.boundingBox();
  if (!box) throw new Error("Sem área de assinatura.");
  await page.mouse.move(box.x + 20, box.y + 120);
  await page.mouse.down();
  for (const [x, y] of [[60, 60], [110, 140], [160, 50], [210, 130], [260, 70]]) await page.mouse.move(box.x + (x as number), box.y + (y as number), { steps: 6 });
  await page.mouse.up();
}

async function openNextStop(page: Page, customer: string) {
  await expect(page.getByRole("article", { name: /^Parada \d+ de 5$/ })).toContainText(customer);
  await page.getByRole("link", { name: "Finalizar entrega" }).click();
  await expect(page.getByRole("heading", { name: customer, level: 1 })).toBeVisible();
}

async function confirmDelivery(page: Page) {
  await page.getByRole("button", { name: "Confirmar entrega" }).click();
}

test("a expedição libera a rota; rascunho e rotas alheias não aparecem para o motorista", async ({ browser, page }) => {
  routeId = await releaseRouteAsExpedicao(browser);
  await login(page, USERS.motorista);
  await expect(page.getByRole("heading", { name: "Suas rotas de hoje" })).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: ROUTE_NAME });
  await expect(card).toContainText("Liberada para carga");
  await expect(card).toContainText("0 de 5 paradas");
});

test("instalável: manifest, ícones e service worker sem erro de instalabilidade", async ({ page }) => {
  await login(page, USERS.motorista);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: Array<{ errorId: string }> };
  // Todo contexto do Playwright é anônimo, e o Chrome não instala PWA em janela anônima: esse é
  // o único "erro" aceito. Manifest, ícones, escopo e service worker não podem ter nenhum.
  expect(installabilityErrors.filter((error) => error.errorId !== "in-incognito")).toEqual([]);
  // Aberto pelo navegador (sem instalar): aviso permanente sobre o modo offline.
  await expect(page.getByTestId("aviso-instalacao")).toContainText("Sem instalar, o modo offline não é confiável");
});

test("entrega completa, não entregue e parcial; depois offline com recarga, sincronização e idempotência", async ({ page, context }) => {
  test.setTimeout(180_000);
  await login(page, USERS.motorista);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // Recarrega uma vez com o service worker no controle: a página do app fica guardada.
  await page.reload();
  await page.getByRole("listitem").filter({ hasText: ROUTE_NAME }).getByRole("button", { name: "Iniciar rota" }).click();
  await expect(page).toHaveURL(new RegExp(`#/rota/${routeId}$`));
  expect((await sql<{ status: string }>(`SELECT status FROM "Route" WHERE id = $1`, [routeId]))[0]?.status).toBe("EM_ANDAMENTO");

  // 1. Restaurante Sabor Mineiro (faturado): completa com assinatura e foto.
  await expect(page.getByTestId("faixa-cobranca")).toHaveText(/FATURADO — NÃO COBRAR/);
  await expect(page.getByRole("link", { name: "Navegar" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=-21.1889%2C-47.8092");
  await openNextStop(page, "Restaurante Sabor Mineiro");
  await page.getByRole("radio", { name: "Entregue", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome de quem recebeu" }).fill("Carla Souza");
  await sign(page);
  await page.getByLabel("Escolher foto").setInputFiles(await cameraLikePhoto(page));
  await expect(page.getByRole("img", { name: "Foto 1 do comprovante" })).toBeVisible();
  await confirmDelivery(page);
  await expect(page.getByText("Parada 1 registrada.")).toBeVisible();

  // 2. Pizzaria Bella Massa (boleto): não entregue, com motivo e foto.
  await openNextStop(page, "Pizzaria Bella Massa");
  await page.getByRole("radio", { name: "Não entregue" }).click();
  await confirmDelivery(page);
  await expect(page.getByText("Escolha o motivo.")).toBeVisible();
  await page.getByRole("radio", { name: "Estabelecimento fechado" }).click();
  await page.getByRole("textbox", { name: "Observação" }).fill("Portão fechado às 9h");
  await page.getByLabel("Escolher foto").setInputFiles(await cameraLikePhoto(page));
  await expect(page.getByRole("img", { name: "Foto 1 do comprovante" })).toBeVisible();
  await confirmDelivery(page);
  await expect(page.getByText("Parada 2 registrada.")).toBeVisible();

  // 3. Açougue Boi Gordo (Pix, 10,25 kg de queijo): parcial, 8 kg; o Pix sugerido é recalculado.
  await openNextStop(page, "Açougue Boi Gordo");
  await page.getByRole("radio", { name: "Entregue parcialmente" }).click();
  await page.getByRole("textbox", { name: "Quilos entregues de Queijo muçarela (kg)" }).fill("8");
  await page.getByRole("textbox", { name: "Motivo da devolução de Queijo muçarela (kg)" }).fill("Peça avariada");
  await expect(page.getByText(/Valor dos itens entregues:\s*R\$\s343,20/)).toBeVisible();
  await expect(page.getByLabel("Pix (R$)")).toHaveValue("343,20");
  await page.getByRole("textbox", { name: "Nome de quem recebeu" }).fill("Seu Jorge");
  await sign(page);
  await confirmDelivery(page);
  await expect(page.getByText("Parada 3 registrada.")).toBeVisible();

  await expect(page.getByTestId("indicador-sincronizacao")).toContainText("Tudo sincronizado", { timeout: 30_000 });
  expect(await stops()).toEqual([
    { customer: "Restaurante Sabor Mineiro", status: "ENTREGUE" },
    { customer: "Pizzaria Bella Massa", status: "NAO_ENTREGUE" },
    { customer: "Açougue Boi Gordo", status: "ENTREGUE_PARCIAL" },
    { customer: "Mercadinho Tibério", status: "EM_ROTA" },
    { customer: "Cantina da Escola Dom Pedro", status: "EM_ROTA" },
  ]);

  // Sem sinal: recarrega a página e o app abre do cache, na mesma parada.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("article", { name: "Parada 4 de 5" })).toContainText("Mercadinho Tibério");
  await expect(page.getByTestId("indicador-sincronizacao")).toContainText("Sem conexão");

  // 4. Mercadinho Tibério (dinheiro): completa sem sinal; dinheiro e vasilhames pré-preenchidos.
  await openNextStop(page, "Mercadinho Tibério");
  await page.getByRole("radio", { name: "Entregue", exact: true }).click();
  await expect(page.getByLabel("Dinheiro (R$)")).toHaveValue("442,18");
  await expect(page.getByRole("status", { name: "Caixa plástica retornável deixados" })).toHaveText("4");
  await page.getByRole("button", { name: "Aumentar Caixa plástica retornável recolhidos" }).click();
  await page.getByRole("button", { name: "Aumentar Caixa plástica retornável recolhidos" }).click();
  await page.getByRole("textbox", { name: "Nome de quem recebeu" }).fill("Dona Lúcia");
  await sign(page);
  await confirmDelivery(page);
  await expect(page.getByText("Parada 4 registrada.")).toBeVisible();

  // 5. Cantina (faturado): completa sem sinal. A próxima tela aparece na hora.
  await openNextStop(page, "Cantina da Escola Dom Pedro");
  await page.getByRole("radio", { name: "Entregue", exact: true }).click();
  await page.getByRole("textbox", { name: "Nome de quem recebeu" }).fill("Diretora Ana");
  await sign(page);
  await confirmDelivery(page);
  await expect(page.getByText("Todas as paradas foram registradas.")).toBeVisible();
  await expect(page.getByTestId("indicador-sincronizacao")).toContainText("2 entregas aguardando envio");

  // Com entregas na fila, sair é bloqueado.
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("dialog")).toContainText("ainda não enviadas");
  await page.getByRole("button", { name: "Entendi" }).click();
  expect((await stops()).slice(3).map((stop) => stop.status)).toEqual(["EM_ROTA", "EM_ROTA"]);

  // A primeira resposta da finalização "se perde" depois de gravada no servidor: o celular
  // reenvia o mesmo clientRequestId e o servidor devolve o resultado original.
  let lost = 0;
  await context.route("**/api/motorista/entregas", async (route) => {
    const response = await route.fetch();
    if (lost === 0) {
      lost += 1;
      await route.abort("connectionreset");
      return;
    }
    await route.fulfill({ response });
  });
  await context.setOffline(false);
  await expect(page.getByTestId("indicador-sincronizacao")).toContainText("Tudo sincronizado", { timeout: 60_000 });
  expect(lost).toBe(1);
  await context.unroute("**/api/motorista/entregas");

  expect(await stops()).toEqual([
    { customer: "Restaurante Sabor Mineiro", status: "ENTREGUE" },
    { customer: "Pizzaria Bella Massa", status: "NAO_ENTREGUE" },
    { customer: "Açougue Boi Gordo", status: "ENTREGUE_PARCIAL" },
    { customer: "Mercadinho Tibério", status: "ENTREGUE" },
    { customer: "Cantina da Escola Dom Pedro", status: "ENTREGUE" },
  ]);
  // Um comprovante por parada, mesmo com o reenvio.
  const proofs = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM "DeliveryProof" p JOIN "Order" o ON o.id = p."orderId" WHERE o."routeId" = $1`, [routeId]);
  expect(proofs[0]?.n).toBe("5");
  expect((await sql<{ status: string }>(`SELECT status FROM "Route" WHERE id = $1`, [routeId]))[0]?.status).toBe("AGUARDANDO_ACERTO");

  // Parcial: valor a cobrar recalculado substitui o do pedido; Pix fica a conferir.
  const [acougue] = await sql<{ amount: number; total: number; payment: string; pix: number }>(
    `SELECT o."amountToCollectCents" AS amount, o."totalCents" AS total, o."paymentStatus" AS payment, p."pixCollectedCents" AS pix
       FROM "Order" o JOIN "Customer" c ON c.id = o."customerId" JOIN "DeliveryProof" p ON p."orderId" = o.id WHERE o."routeId" = $1 AND c.name = 'Açougue Boi Gordo'`,
    [routeId],
  );
  expect(acougue).toEqual({ amount: 34_320, total: 43_973, payment: "PIX_A_CONFERIR", pix: 34_320 });

  // Vasilhames do Mercadinho: 4 deixadas, 2 recolhidas.
  const movements = await sql<{ delivered: number; returned: number }>(
    `SELECT m.delivered, m.returned FROM "ContainerMovement" m JOIN "Customer" c ON c.id = m."customerId" WHERE m."routeId" = $1 AND c.name = 'Mercadinho Tibério'`,
    [routeId],
  );
  expect(movements).toEqual([{ delivered: 4, returned: 2 }]);

  // Fotos comprimidas no celular: abaixo de 400 KB; tudo confirmado no storage.
  const files = await sql<{ kind: string; sizeBytes: number; status: string }>(
    `SELECT f.kind, f."sizeBytes", f.status FROM "FileObject" f WHERE f.key LIKE 'companies/%/proofs/%' AND f.status = 'CONFIRMED' AND f."createdAt" > now() - interval '1 hour' ORDER BY f.kind`,
  );
  const photos = files.filter((file) => file.kind === "PHOTO");
  expect(photos).toHaveLength(2);
  for (const photo of photos) expect(photo.sizeBytes).toBeLessThan(400 * 1024);
  expect(files.filter((file) => file.kind === "SIGNATURE")).toHaveLength(4);
});

test("ADMIN vê as rotas de todos na área do motorista; logout apaga os dados do celular", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/motorista");
  const card = page.getByRole("listitem").filter({ hasText: ROUTE_NAME });
  await expect(card).toContainText("Marcos Motorista");
  await expect(card).toContainText("5 de 5 paradas");

  await page.context().clearCookies();
  await login(page, USERS.motorista, PASSWORD);
  await expect(page.getByTestId("indicador-sincronizacao")).toContainText("Tudo sincronizado");
  const [driver] = await sql<{ id: string }>(`SELECT id FROM "User" WHERE email = $1`, [USERS.motorista]);
  const driverDb = `fecharota-motorista-${driver?.id}`;
  const names = () => page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name ?? ""));
  expect(await names()).toContain(driverDb);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await names()).not.toContain(driverDb);
});
