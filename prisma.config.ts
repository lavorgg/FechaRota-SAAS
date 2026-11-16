// Configuração da CLI do Prisma 7 (migrations, generate, seed).
// A CLI não carrega o .env sozinha: por isso o import abaixo.
// A CLI usa DIRECT_URL (conexão direta). O app, em runtime, usa DATABASE_URL (com pooling) em lib/db.ts.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Vazio só acontece em `prisma generate` sem .env (ex.: postinstall numa máquina limpa),
    // que não abre conexão. Qualquer comando de migration falha com mensagem clara do Prisma.
    url: process.env["DIRECT_URL"] ?? "",
  },
});
