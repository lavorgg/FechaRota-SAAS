// Tela de auditoria: só ADMIN, com os eventos do seed e filtro por evento.

import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

test("ADMIN consulta a auditoria e filtra por evento", async ({ page }) => {
  await login(page, USERS.admin);
  await page.getByRole("list", { name: "Menu principal" }).getByRole("link", { name: "Auditoria" }).click();
  await expect(page.getByRole("heading", { name: "Auditoria", level: 1 })).toBeVisible();
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "Acerto concluído" }).first()).toContainText("Edu Expedição");
  await expect(rows.filter({ hasText: "Acerto concluído" }).first()).toContainText("Rota R-0001 · Centro (manhã)");

  await page.getByLabel("Evento").selectOption({ label: "Pix confirmado no extrato" });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/tipo=PIX_CONFIRMADO/);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("Pagamento: Pix a conferir → Recebido");
  await expect(page.getByText(/fecharota123|passwordHash/)).toHaveCount(0);
});

test("EXPEDICAO não tem a auditoria", async ({ page }) => {
  await login(page, USERS.expedicao);
  await expect(page.getByRole("list", { name: "Menu principal" }).getByRole("link", { name: "Auditoria" })).toHaveCount(0);
  await page.goto("/app/auditoria");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});
