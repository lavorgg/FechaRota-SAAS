import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "generated/**",
    "playwright-report/**",
    "test-results/**",
    ".agents/**",
    ".claude/**",
  ]),
  {
    // Seção 3.4: páginas, Server Actions, Route Handlers e componentes NUNCA usam o client
    // Prisma global. Todo acesso ao banco passa por getTenantDb() (lib/tenant-db.ts).
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)lib/db$",
              message: "Não use o client Prisma global aqui. Use getTenantDb(session) de @/lib/tenant-db.",
            },
            {
              regex: "(^|/)generated/prisma(/|$)",
              message: "Não importe o client Prisma gerado aqui. Use getTenantDb(session) e os tipos/DTOs de lib/.",
            },
            {
              regex: "(^|/)lib/storage/(admin|client)$",
              message: "O app não envia arquivos pelo servidor. Use createUploadUrl() de @/lib/storage.",
            },
            {
              regex: "^@prisma/(client|adapter-pg)$",
              message: "Não crie clients Prisma fora de lib/db.ts.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
