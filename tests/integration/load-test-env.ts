// Carrega o .env.test e garante que os testes NUNCA apontem para o banco ou o bucket de dev.

import path from "node:path";

import { config } from "dotenv";

export function loadTestEnv(): void {
  config({ path: path.resolve(import.meta.dirname, "../../.env.test"), override: true, quiet: true });

  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  const isLocal = databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1";
  if (!isLocal || !databaseUrl.pathname.endsWith("_test")) {
    throw new Error("Os testes de integração só rodam contra um banco local cujo nome termina em _test.");
  }
  if (!(process.env.S3_BUCKET ?? "").endsWith("-test")) {
    throw new Error("Os testes de integração só rodam contra um bucket cujo nome termina em -test.");
  }
}
