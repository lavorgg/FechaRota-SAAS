# FechaRota

SaaS B2B de romaneio de carga, sequência de entregas e comprovante de entrega para distribuidoras com frota própria. Painel administrativo no computador e área do motorista instalada no celular (PWA), funcional com sinal ruim.

A especificação completa está em [`docs/especificacao-mvp-v3.md`](docs/especificacao-mvp-v3.md). Os comentários do código citam as seções dela ("seção 3.4").

**Situação:** Fases 1, 2 e 3 prontas no código: fundação, login e permissões, dashboard, cadastros (clientes, produtos, veículos, usuários), importação por CSV, lançamento rápido de pedidos, pedidos recorrentes e gerador. Falta o deploy de preview na Vercel, que depende das contas externas (veja "Deploy de preview na Vercel"). Rotas, romaneios, app do motorista e fechamento vêm nas próximas fases.

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
- Entre em <http://localhost:3000/login> com uma das contas impressas pelo seed (senha `fecharota123`): `admin@exemplo.test`, `expedicao@exemplo.test` ou `motorista1@exemplo.test`.
- Para trocar de perfil sem sair e entrar de novo, defina `ENABLE_DEV_IMPERSONATION="true"` no `.env` e rode `pnpm dev`. O botão "Trocar perfil (dev)" aparece no canto da tela. Fora de `next dev` a troca não existe: o app se recusa a iniciar com essa variável ligada.

### Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento (o service worker fica desligado) |
| `pnpm build` | `prisma generate`, migrations (só em produção na Vercel) e `next build` |
| `pnpm start` | Serve o build de produção |
| `pnpm typecheck` | Gera os tipos de rota do Next e roda `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest: testes unitários e de integração (exige `docker compose up -d`) |
| `pnpm test:e2e` | Playwright sobre o build de produção. Usa banco (`fecharota_e2e`) e bucket (`fecharota-e2e`) próprios, recriados a cada execução a partir do `.env.e2e`: não apaga os dados de desenvolvimento |
| `pnpm db:migrate` | Cria e aplica migration em desenvolvimento (`prisma migrate dev`) |
| `pnpm db:deploy` | Aplica migrations pendentes (`prisma migrate deploy`) |
| `pnpm db:seed` | Roda o seed de demonstração num banco vazio |
| `pnpm db:reset` | Recria banco e bucket locais do zero e roda o seed |

Componentes do shadcn/ui são adicionados com `pnpm dlx shadcn@4.23.0 add <componente>`. A fonte é a do sistema: o `shadcn init` sugere Geist via `next/font/google`, que foi descartada para o build não depender de baixar fontes.

O Playwright baixa o próprio Chromium com `pnpm exec playwright install chromium`. Para usar um Chromium já instalado, defina `PLAYWRIGHT_CHROMIUM_PATH`.

## Stack

| Camada | Escolha |
|---|---|
| Runtime | Node.js 22 |
| Framework | Next.js 16 (App Router, Turbopack), TypeScript estrito com `noUncheckedIndexedAccess` |
| UI | Tailwind CSS v4 + shadcn/ui (base Radix, estilo `radix-nova`) + `lucide-react` |
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

## Autenticação e permissões (Fase 2)

- **Login só por e-mail e senha.** O telefone não é único no sistema, então não serve de login (decisão do dono do produto).
- **Sessão** em tabela `Session`. O navegador guarda um token aleatório; o banco guarda só o hash SHA-256. Cookie `HttpOnly`, `SameSite=Lax` e, em produção, `Secure` com prefixo `__Host-`. Duração: 30 dias para motorista, 12 horas para o painel.
- **Verificação em cada página e Server Action** (`lib/auth/current.ts`, `lib/actions/run-action.ts`). O `proxy.ts` só manda para o login quem chega sem cookie.
- **Matriz de permissões** em `lib/auth/permissions.ts`, conferida por teste contra a tabela da seção 5.1.
- **Rate limit** (`lib/rate-limit`): login com 10 tentativas por e-mail + IP e 100 por IP em 15 minutos (login certo zera a contagem do e-mail), cadastro de empresa com 5 por IP por hora. As chaves vão para o Redis como hash.
- **Plano em atraso ou cancelado** (`PAST_DUE`, `CANCELED`): o painel mostra o aviso e todas as alterações são recusadas no servidor.
- **Usuários:** o ADMIN cria e promove qualquer papel, inclusive ADMIN. Ninguém muda o próprio papel nem se desativa, e a empresa nunca fica sem ADMIN ativo (inclusive com duas alterações simultâneas). Troca de papel, desativação e nova senha encerram as sessões do usuário. Tudo vai para a auditoria, sem senha.

## Cadastros e pedidos (Fase 3)

- **Lançamento rápido** em `/app/pedidos`: tecla `N` abre a gaveta. Busque o cliente (nome, bairro ou telefone, sem acento) e tecle `Enter`. Na busca de produto, `Enter` adiciona com quantidade 1; `Tab` vai para a quantidade e `Enter` lá adiciona. `Ctrl+Enter` salva e já abre o próximo pedido. Preço e total são recalculados no servidor.
- **Segundo pedido do cliente no mesmo dia** pede confirmação.
- **Pedidos recorrentes**: criados pelo lançamento rápido ("Salvar também como pedido recorrente") ou na tela do cliente, onde também se editam, pausam até uma data e desativam. O botão "Gerar recorrentes para [data]" (em Pedidos e no alerta do dashboard) cria os pedidos do dia numa transação. Rodar de novo não duplica. Template com cliente ou produto inativo é ignorado e listado com o motivo.
- **Reagendar** um pedido não entregue cria um pedido novo na data escolhida, ligado ao original, que continua como não entregue.
- **Importação por CSV** de clientes e produtos: modelo para download, pré-visualização, envio em lotes de 200 linhas e relatório por linha. Aceita arquivos do Excel (`;` e Windows-1252). Linha com SKU ou CPF/CNPJ já cadastrado é recusada.
- **Buscar CEP** consulta o ViaCEP direto do navegador, com limite de 3 segundos. Se falhar, o endereço é preenchido à mão.

## Rotas e romaneios (Fase 4)

- **Montar rota** em `/app/rotas`, na data do seletor do topo: os pedidos pendentes sem rota aparecem agrupados por cidade e bairro (pela chave normalizada, então "Centro", "centro " e "CENTRO" são um bairro só), com quantidade de pedidos, peso estimado, volumes (itens dos pedidos) e valor. Marque o bairro inteiro ou abra o bairro e escolha pedido a pedido. Escolha motorista (só MOTORISTA ativo) e veículo; peso acima da capacidade do veículo gera aviso, não bloqueio.
- **Ordem das paradas**: a inicial é por bairro, rua e número. É uma ordenação simples, não otimização de trajeto. Em `/app/rotas/[id]` dá para arrastar (mouse, toque ou teclado: espaço pega, setas movem, espaço solta) ou usar os botões subir e descer. Cada mudança é gravada na hora e confere a versão da rota.
- **Google Maps**: um botão com as paradas na ordem, partindo do endereço do depósito (cadastrado em `/app/empresa`). Rota com mais de 10 paradas é dividida em trechos, um botão por trecho; cada trecho começa na última parada do anterior.
- **Liberar para carga** congela a rota, passa os pedidos para "Em rota" e libera a impressão. **Reabrir** é só do ADMIN, antes de o motorista iniciar, com motivo opcional na auditoria. **Excluir** só vale para rascunho: os pedidos voltam para "sem rota" e o código não é reaproveitado.
- **Romaneios** de carga e de entrega em `/app/rotas/[id]/romaneio-carga` e `/romaneio-entrega`: A4 retrato, cabeçalho (empresa, código e versão da rota, data, motorista, veículo, data e hora da geração) repetido em toda página, uma parada nunca quebra entre páginas, tudo legível em preto e branco. No Chrome, "Salvar como PDF" gera o arquivo. O E2E grava os dois PDFs em `test-results/`.

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
lib/                  infraestrutura: env, banco, isolamento por empresa, storage,
                      autenticação, rate limit, serviços e validação compartilhada
prisma/               schema, migrations e seed
scripts/              db:reset, etapa de migration do build, gerador de ícones
tests/integration/    Vitest contra Postgres e storage de teste
tests/e2e/            Playwright sobre o build de produção (banco e bucket do .env.e2e)
proxy.ts              redireciona para o login quem chega sem cookie de sessão
```
