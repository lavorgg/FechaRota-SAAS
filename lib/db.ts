// PrismaClient GLOBAL (sem filtro de empresa), singleton.
//
// ATENÇÃO: é proibido importar este arquivo em páginas, Server Actions e Route Handlers
// (o ESLint bloqueia). Lá, todo acesso ao banco passa por getTenantDb() em lib/tenant-db.ts.
// Quem pode importar daqui: lib/tenant-db.ts, lib/auth/**, lib/health.ts, prisma/seed.ts,
// scripts/** e testes.
//
// Runtime usa DATABASE_URL (com pooling). Migrations usam DIRECT_URL (prisma.config.ts).

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { env } from "./env";

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    // Segredos nunca saem numa consulta comum. O módulo de autenticação pede esses campos
    // explicitamente com `omit: { passwordHash: false }` quando precisa conferir a senha.
    omit: {
      user: { passwordHash: true },
      session: { tokenHash: true },
    },
  });
}

// Em desenvolvimento o hot reload reavalia os módulos; guardar no globalThis evita abrir
// um pool de conexões novo a cada alteração de arquivo.
type AppPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as typeof globalThis & { __fecharotaPrisma?: AppPrismaClient };

export const prisma: AppPrismaClient = globalForPrisma.__fecharotaPrisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.__fecharotaPrisma = prisma;
}
