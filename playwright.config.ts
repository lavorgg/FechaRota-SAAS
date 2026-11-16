import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Os testes E2E rodam SEMPRE sobre o build de produção (seção 9): é o único jeito de testar
// o service worker, que fica desligado em `next dev`.
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
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
