import { defineConfig, devices } from "@playwright/test";

import { e2eEnv } from "./tests/e2e/env";

const PORT = 3100;

// Os testes E2E rodam SEMPRE sobre o build de produção (seção 9): é o único jeito de testar
// o service worker, que fica desligado em `next dev`. Banco e bucket são os do .env.e2e,
// recriados por tests/e2e/prepare.ts a cada execução, antes do build.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    launchOptions: {
      // Opcional: usa um Chromium já instalado na máquina em vez do baixado pelo Playwright.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  projects: [
    {
      name: "celular",
      testMatch: ["fundacao.spec.ts", "motorista.spec.ts", "painel-celular.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: "painel",
      testMatch: ["auth.spec.ts", "permissoes.spec.ts", "dashboard.spec.ts", "usuarios.spec.ts", "cadastros.spec.ts", "importacao.spec.ts", "pedidos.spec.ts", "rotas.spec.ts", "fechamento.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
    },
    {
      // Fluxo do motorista (Fase 5): muda a situação de pedidos de hoje, então roda depois de
      // todos os outros projetos.
      name: "entregas",
      testMatch: ["entregas.spec.ts"],
      dependencies: ["celular", "painel"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `pnpm exec tsx tests/e2e/prepare.ts && pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    env: e2eEnv(),
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
