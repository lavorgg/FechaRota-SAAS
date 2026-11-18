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

/**
 * Foto "de câmera" para os testes: 4000×3000 com ruído (difícil de comprimir), JPEG 0,95,
 * gerada no próprio Chromium. Fica bem acima de 400 KB e de 1600 px.
 */
export async function cameraLikePhoto(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 4000;
    canvas.height = 3000;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Sem canvas.");
    const image = context.createImageData(canvas.width, canvas.height);
    let seed = 7;
    for (let index = 0; index < image.data.length; index += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const x = (index / 4) % canvas.width;
      const y = Math.floor(index / 4 / canvas.width);
      image.data[index] = (x / 16 + (seed & 31)) & 255;
      image.data[index + 1] = (y / 12 + ((seed >> 5) & 31)) & 255;
      image.data[index + 2] = ((x + y) / 28 + ((seed >> 10) & 31)) & 255;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) throw new Error("Sem foto.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    return btoa(binary);
  });
  return { name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") };
}
