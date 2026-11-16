// Verificações do /api/health: banco e storage. Devolve só "ok"/"falha", sem detalhes do erro
// (mensagem do Prisma, host, credencial) para não vazar informação.

import { prisma } from "./db";
import { pingStorage } from "./storage";

export type HealthCheckResult = "ok" | "falha";
export type HealthReport = {
  status: HealthCheckResult;
  checks: { database: HealthCheckResult; storage: HealthCheckResult };
};

const CHECK_TIMEOUT_MS = 4000;

async function runCheck(name: string, check: () => Promise<unknown>): Promise<HealthCheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("tempo esgotado")), CHECK_TIMEOUT_MS);
      }),
    ]);
    return "ok";
  } catch (error) {
    // Só o nome do erro vai para o log do servidor: a mensagem pode conter a URL de conexão.
    console.error(`[health] verificação "${name}" falhou: ${error instanceof Error ? error.name : "erro desconhecido"}`);
    return "falha";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkHealth(): Promise<HealthReport> {
  const [database, storage] = await Promise.all([
    runCheck("database", () => prisma.$queryRaw`SELECT 1`),
    runCheck("storage", () => pingStorage()),
  ]);
  return {
    status: database === "ok" && storage === "ok" ? "ok" : "falha",
    checks: { database, storage },
  };
}
