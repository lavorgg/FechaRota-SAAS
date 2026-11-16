# FechaRota

SaaS B2B de romaneio de carga, sequência de entregas e comprovante de entrega para distribuidoras com frota própria. Painel administrativo no computador e área do motorista instalada no celular (PWA), funcional com sinal ruim.

A especificação completa está em [`docs/especificacao-mvp-v3.md`](docs/especificacao-mvp-v3.md). Os comentários do código citam as seções dela ("seção 3.4").

**Situação:** Fase 1 (fundação) concluída. Ainda não há login, cadastros nem telas de negócio.

## O que o produto não é

- Não é um otimizador de rotas: a sequência de paradas é definida manualmente.
- Não emite NF-e: o romaneio é documento operacional e não substitui a nota fiscal.
- O "Comprovante de Entrega" não tem validade jurídica equivalente ao canhoto da NF-e.

## Rodar na sua máquina

Pré-requisitos: Node.js 22, pnpm 10 e Docker.

```bash
docker compose up -d
```

```bash
cp .env.example .env
```

```bash
pnpm install
```

```bash
pnpm db:reset
```

```bash
pnpm test
```

```bash
pnpm dev
```

- `docker compose up -d` sobe o Postgres de desenvolvimento (porta 5432), o Postgres de teste (5433) e o armazenamento S3 local (9000), e cria os buckets `fecharota-dev` e `fecharota-test`.
- `pnpm db:reset` apaga o banco e o bucket **locais**, aplica as migrations e roda o seed. As credenciais de demonstração aparecem no terminal. O comando se recusa a rodar contra qualquer host que não seja `localhost`.
- Com `pnpm dev` no ar, <http://localhost:3000/api/health> deve responder `{"status":"ok","checks":{"database":"ok","storage":"ok"}}`.

### Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento (o service worker fica desligado) |
| `pnpm build` | `prisma generate`, migrations (só em produção na Vercel) e `next build` |
| `pnpm start` | Serve o build de produção |
| `pnpm typecheck` | Gera os tipos de rota do Next e roda `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest: testes unitários e de integração (exige `docker compose up -d`) |
| `pnpm test:e2e` | Playwright sobre o build de produção (faz o build sozinho) |
| `pnpm db:migrate` | Cria e aplica migration em desenvolvimento (`prisma migrate dev`) |
| `pnpm db:deploy` | Aplica migrations pendentes (`prisma migrate deploy`) |
| `pnpm db:seed` | Roda o seed de demonstração num banco vazio |
| `pnpm db:reset` | Recria banco e bucket locais do zero e roda o seed |

O Playwright baixa o próprio Chromium com `pnpm exec playwright install chromium`. Para usar um Chromium já instalado, defina `PLAYWRIGHT_CHROMIUM_PATH`.

## Stack

| Camada | Escolha |
|---|---|
| Runtime | Node.js 22 |
| Framework | Next.js 16 (App Router, Turbopack), TypeScript estrito com `noUncheckedIndexedAccess` |
| UI | Tailwind CSS v4 |
| Banco | PostgreSQL 16, Prisma 7 com `@prisma/adapter-pg` |
| Arquivos | API S3: RustFS local, Cloudflare R2 na Vercel |
| PWA | Serwist (`@serwist/turbopack`) |
| Testes | Vitest e Playwright |

Todas as versões estão fixadas sem `^` no `package.json`.

## Regras de engenharia

Estas regras vêm da seção 3 da especificação e são verificadas por teste ou por lint.

- **Dinheiro** é sempre `Int` em centavos (`domain/money.ts`). O banco recusa valor negativo.
- **Quantidade** é `Decimal(10,3)` no banco e inteiro em milésimos no código (`domain/quantity.ts`). O subtotal arredonda meio centavo para cima, por item.
- **Data de entrega** é data de calendário (`YYYY-MM-DD`, coluna `@db.Date`). "Hoje" é calculado no fuso da empresa (`domain/dates.ts`).
- **Isolamento entre empresas** tem duas barreiras:
  1. `getTenantDb(session)` (`lib/tenant-db.ts`) injeta `companyId` em toda leitura e gravação. Páginas, actions e handlers não podem importar o client global `lib/db.ts`: o ESLint bloqueia.
  2. As relações entre tabelas de negócio usam chave estrangeira composta (`companyId` + `id`), então o Postgres rejeita um pedido que aponte para cliente, rota ou produto de outra empresa.
- **Numeração por empresa** usa `CompanyCounter` com incremento atômico na mesma transação (`lib/counters.ts`).
- **Arquivos** nunca passam pelas funções da Vercel. O navegador envia e baixa direto do storage com URL pré-assinada (`lib/storage`), e toda chave começa com `companies/{companyId}/`.
- **Variáveis de ambiente** são validadas em todo `next dev`, `next build` e `next start` (`lib/env.ts`). Faltando alguma, o comando falha com a lista do que corrigir.

## Decisões da Fase 1

### Serwist com Turbopack

A especificação pedia escolher entre `@serwist/turbopack` e `@serwist/next` (este exige `next build --webpack`). Foi escolhido **`@serwist/turbopack`**, porque o Turbopack é o bundler padrão do Next 16 e manter o webpack só para o service worker criaria dois caminhos de build. A integração foi validada por teste E2E sobre o build de produção.

Consequências:

- `cacheComponents` do Next fica **desligado**. O `@serwist/turbopack` serve o service worker por um Route Handler com `dynamic = "force-static"`, opção que não existe com `cacheComponents` ligado.
- O service worker é servido em `/serwist/sw.js` e registrado com escopo `/motorista`. Ele não controla o painel.
- Nada é pré-cacheado por varredura de arquivos, porque isso incluiria os scripts do painel. Os arquivos estáticos entram no cache quando as páginas do motorista os pedem.
- O service worker não chama `skipWaiting` sozinho: uma versão nova só assume depois da mensagem `SKIP_WAITING` (o aviso "Nova versão disponível" entra na Fase 5).

### RustFS no lugar do MinIO

A especificação pedia MinIO no Docker Compose, mas a imagem `minio/minio` foi removida do Docker Hub. O ambiente local usa **RustFS**, que expõe a mesma API S3. O código do app é o mesmo para RustFS e R2: só mudam as variáveis `S3_*`.

### Rate limit em memória em build local

A especificação permite rate limit em memória só com `NODE_ENV=development`. Os testes E2E, porém, rodam sobre o build de produção (`NODE_ENV=production`) na máquina local, onde não há Upstash. Para isso existe `ALLOW_IN_MEMORY_RATE_LIMIT="true"`, que só vale fora da Vercel: com `VERCEL_ENV` definida, a variável faz o build falhar e o Upstash continua obrigatório.

## Deploy de preview na Vercel

O uso comercial exige o **plano Pro** da Vercel.

1. **Banco (Neon ou Supabase, região São Paulo `sa-east-1`).** Crie um banco só para preview. Preview nunca aponta para o banco de produção. Anote o endereço com pooling (`DATABASE_URL`) e o endereço direto (`DIRECT_URL`).
2. **Arquivos (Cloudflare R2).** Crie um bucket privado só para preview e um token de API com leitura e escrita nesse bucket. O endpoint é `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, a região é `auto` e `S3_FORCE_PATH_STYLE` é `false`.
3. **Rate limit (Upstash Redis).** Crie uma instância para preview e anote a URL REST e o token.
4. **Projeto na Vercel.** Conecte o repositório. Em *Settings → General*, use Node.js 22. A região das funções (`gru1`) já está no `vercel.json`.
5. **Variáveis de ambiente**, no ambiente *Preview*: todas as do `.env.example`, exceto `ALLOW_IN_MEMORY_RATE_LIMIT` e `ENABLE_DEV_IMPERSONATION`, que devem ficar ausentes. Gere o `CRON_SECRET` com `openssl rand -hex 32`.
6. **Migrations do banco de preview.** O build só aplica migrations em produção. No preview, aplique da sua máquina, com a `DIRECT_URL` do banco de preview:

   ```bash
   DIRECT_URL="postgresql://..." pnpm db:deploy
   ```

7. **Seed em preview** (opcional, sobre o banco vazio). Use as variáveis do ambiente de preview:

   ```bash
   DATABASE_URL="postgresql://..." DIRECT_URL="postgresql://..." S3_ENDPOINT="https://..." S3_REGION="auto" S3_ACCESS_KEY_ID="..." S3_SECRET_ACCESS_KEY="..." S3_BUCKET="..." S3_FORCE_PATH_STYLE="false" pnpm db:seed
   ```

8. **Deploy.** Abra um pull request ou faça push de um branch. Quando o deploy terminar, `https://<url-do-preview>/api/health` deve responder com `database` e `storage` em `ok`.

O deploy de produção, o CORS do R2 e os crons entram na Fase 6.

## Estrutura

```
app/                  rotas do Next (páginas, Route Handlers, service worker)
components/           componentes React
domain/               regras de negócio puras, sem banco (com testes unitários)
lib/                  infraestrutura: env, banco, isolamento por empresa, storage
prisma/               schema, migrations e seed
scripts/              db:reset, etapa de migration do build, gerador de ícones
tests/integration/    Vitest contra Postgres e storage de teste
tests/e2e/            Playwright sobre o build de produção
```
