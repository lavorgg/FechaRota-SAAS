import path from "node:path";

import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname),
  // "server-only" lança erro fora do servidor do Next. Nos testes, os módulos de servidor
  // rodam em Node puro, então o import vira um módulo vazio.
  "server-only": path.resolve(import.meta.dirname, "tests/support/empty-module.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        // Lógica pura: não precisa de banco nem de storage.
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["domain/**/*.test.ts", "lib/**/*.test.ts"],
        },
      },
      {
        // Postgres de teste (porta 5433) + bucket de teste. Exige `docker compose up -d`.
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup-env.ts"],
          // Os arquivos compartilham o mesmo banco: rodam um de cada vez.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
