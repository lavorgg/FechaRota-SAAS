// Fechamento (seção 9): os números da rota de ontem do seed conferem. Rota "Centro (manhã)",
// já CONCLUIDA: 1 entregue em dinheiro, 1 entregue em Pix (conferido), 1 parcial em boleto e 1
// não entregue.

import { type Page, expect, test } from "@playwright/test";

import { USERS, login, sql } from "./helpers";

async function seedRouteId(): Promise<string> {
  const [row] = await sql<{ id: string }>(`SELECT id FROM "Route" WHERE name = 'Centro (manhã)' AND status = 'CONCLUIDA' LIMIT 1`);
  if (!row) throw new Error("Rota de ontem do seed não encontrada.");
  return row.id;
}

function figure(page: Page, label: string) {
  return page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) });
}

test("números do acerto da rota de ontem conferem com o seed", async ({ page }) => {
  const routeId = await seedRouteId();
  await login(page, USERS.expedicao);
  await page.goto(`/app/rotas/${routeId}`);
  await page.getByRole("link", { name: "Fechamento" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/rotas/${routeId}/fechamento$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Fechamento · R-0001 · Centro (manhã)");
  await expect(page.getByText(/Acerto concluído em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} por Edu Expedição/)).toBeVisible();

  // Dinheiro: esperado = 250,76 (dinheiro) + 415,70 (Pix); o parcial é boleto e o não entregue não conta.
  await expect(figure(page, "Esperado")).toContainText(/R\$\s666,46/);
  await expect(figure(page, "Recebido em dinheiro")).toContainText(/R\$\s250,76/);
  await expect(figure(page, "Pix informado")).toContainText(/R\$\s415,70/);
  await expect(figure(page, "Pix conferido")).toContainText(/R\$\s415,70/);
  await expect(figure(page, "Pix a conferir")).toContainText(/R\$\s0,00/);
  await expect(page.getByLabel("Dinheiro entregue pelo motorista no caixa")).toHaveValue("250,76");
  await expect(page.getByTestId("diferenca-caixa")).toHaveText("Sem diferença");

  // Mercadoria: carregado, entregue e devolvido por produto.
  const goods = page.getByRole("region", { name: "Mercadoria" }).getByRole("row");
  const row = (sku: string) => goods.filter({ has: page.getByRole("cell", { name: sku, exact: true }) });
  await expect(row("LEITE-1L")).toContainText(/24 UN\s*24 UN\s*0 UN/);
  await expect(row("IOG-170")).toContainText(/48 UN\s*24 UN\s*24 UN/);
  await expect(row("QJ-MUSS")).toContainText(/4,75 KG\s*3,25 KG\s*1,5 KG/);
  await expect(row("REFRI-2L-FD")).toContainText(/5 FD\s*3 FD\s*2 FD/);
  await expect(row("CERV-600-CX")).toContainText(/2 CX\s*2 CX\s*0 CX/);

  // Vasilhames: caixas saíram 4 (leite 2 + iogurte 2), ficaram 3, voltou 1.
  const containers = page.getByRole("region", { name: "Vasilhames" }).getByRole("row");
  await expect(containers.filter({ hasText: "Caixa plástica" })).toContainText(/Caixa plástica retornável\s*4\s*3\s*1\s*2\s*2/);
  await expect(containers.filter({ hasText: "Engradado" })).toContainText(/Engradado retornável 24 garrafas\s*2\s*2\s*2\s*2\s*0/);

  // Pix conferido e pendência de reagendamento.
  const pix = page.getByRole("region", { name: "Pix" });
  await expect(pix).toContainText("Bar do Zeca");
  await expect(pix.getByRole("checkbox")).toBeChecked();
  const pending = page.getByRole("region", { name: "Pendências" });
  await expect(pending).toContainText("Lanchonete Ponto Certo");
  await expect(pending).toContainText("Estabelecimento fechado · Portas fechadas, ninguém atendeu o telefone.");
  await expect(pending.getByRole("button", { name: "Reagendar" })).toBeVisible();

  // Comprovante: a assinatura vem do storage por URL de 5 minutos.
  await page.getByTestId("parada-acerto").first().getByRole("button", { name: "Ver comprovante" }).click();
  const signature = page.getByRole("dialog").getByRole("img", { name: "Assinatura do recebedor" });
  await expect(signature).toBeVisible();
  await expect.poll(() => signature.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  // Resumo imprimível.
  await page.getByRole("link", { name: "Resumo do acerto (A4)" }).click();
  const summary = page.getByRole("article", { name: "Resumo do acerto" });
  await expect(summary).toContainText("Acerto concluído em");
  await expect(summary).toContainText("Sem diferença");
  await expect(summary).toContainText(/Esperado \(pedidos entregues\)\s*R\$\s666,46/);
});

test("motorista não chega ao fechamento", async ({ page }) => {
  const routeId = await seedRouteId();
  await login(page, USERS.motorista);
  await page.goto(`/app/rotas/${routeId}/fechamento`);
  await expect(page).toHaveURL(/\/motorista/);
});
