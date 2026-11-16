// Etapa do build (seção 3.12): aplica as migrations SOMENTE no ambiente de produção da Vercel.
// Em preview e em builds locais não faz nada: o banco de preview é migrado à parte
// (ver README, "Deploy de preview").

import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[build] VERCEL_ENV=${process.env.VERCEL_ENV ?? "(não definida)"}: migrations não são aplicadas neste build.`);
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  console.error("[build] DIRECT_URL não está definida: não é possível aplicar as migrations em produção.");
  process.exit(1);
}

console.log("[build] Produção: aplicando migrations com prisma migrate deploy...");
const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
