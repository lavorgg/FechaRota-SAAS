import { type Page, expect } from "@playwright/test";
import { Client } from "pg";

import { e2eEnv } from "./env";

export const PASSWORD = "fecharota123";

export const USERS = {
  admin: "admin@exemplo.test",
  expedicao: "expedicao@exemplo.test",
  motorista: "motorista1@exemplo.test",
  adminVizinha: "admin@vizinha.test",
} as const;

export async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** SQL direto no banco do E2E, para preparar cenários (ex.: plano em atraso). */
export async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: e2eEnv().DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}
