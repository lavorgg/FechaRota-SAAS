import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "dotenv";

/** Variáveis do .env.e2e (o servidor do E2E e o global-setup usam só estas). */
export function e2eEnv(): Record<string, string> {
  // O Playwright roda a partir da raiz do repositório (e transpila para CommonJS, sem import.meta).
  return parse(readFileSync(path.resolve(process.cwd(), ".env.e2e"), "utf8"));
}
