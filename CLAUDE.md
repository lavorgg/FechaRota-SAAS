# FechaRota

SaaS B2B de romaneio, rotas e comprovante de entrega. A especificação é [`docs/especificacao-mvp-v3.md`](docs/especificacao-mvp-v3.md): leia a seção da fase antes de começar. O código cita as seções dela ("seção 3.4").

## Como trabalhar aqui

- **Uma fase por vez** (seção 11). Ao terminar: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, resumo com os entregáveis da seção 12, e pare para revisão.
- Não confie na memória sobre APIs: confira a versão no `package.json`. O Next traz a documentação da própria versão em `node_modules/next/dist/docs/`.
- Instrução ambígua ou contraditória: pergunte antes de implementar. Não invente regra de negócio.
- Nada fora do escopo da fase, nem como esqueleto. Sem placeholder e sem TODO.
- Interface, mensagens de erro e comentários em português.

## Comandos

```bash
docker compose up -d   # Postgres dev (5432), Postgres teste (5433), S3 local (9000)
pnpm db:reset          # recria banco e bucket LOCAIS e roda o seed
pnpm typecheck
pnpm lint
pnpm test              # unitários + integração (precisa do docker compose)
pnpm test:e2e          # Playwright sobre o build de produção (banco e bucket do .env.e2e)
```

Componentes do shadcn/ui: `pnpm dlx shadcn@4.23.0 add <componente>` (base Radix). Depois de adicionar, fixe as versões novas no `package.json` sem `^`.

Neste contêiner de nuvem o Playwright precisa de `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`, e o Docker precisa ser iniciado à mão (`dockerd &`).

## Regras que não podem ser quebradas

- Dinheiro: `Int` em centavos. Quantidade: milésimos no código, `Decimal(10,3)` no banco. Nunca `Float`.
- Data de entrega: texto `YYYY-MM-DD` e `@db.Date`. "Hoje" sempre por `todayInTimeZone(company.timezone)`.
- Banco em `app/` e `components/`: só por `getTenantDb(session)`. O ESLint bloqueia `lib/db`.
- Toda Server Action do painel passa por `runAction` (sessão, permissão, plano somente leitura, Zod). Regra de negócio vai em `lib/services/*`, que recebem `ServiceContext` e chamam `assertCan`/`assertCanWrite` de novo.
- Toda página confere a própria permissão (`requirePagePermission`); o layout não basta.
- Permissão nova: só em `lib/auth/permissions.ts`, com o teste da matriz atualizado.
- No client por empresa, use chaves escalares (`customerId: "..."`). `connect`, `connectOrCreate` e `set` de relação são recusados, porque copiariam o `companyId` do registro conectado.
- Modelo novo no schema: classifique em `lib/tenant-scope.ts` e use chave estrangeira composta (`companyId` + `id`) nas relações. Há teste que falha se faltar.
- Arquivos: só por URL pré-assinada de `lib/storage`. Chave sempre `companies/{companyId}/...`.
- Numeração: `nextCounterValue` na mesma transação que cria o registro.
- Sem estado em memória entre requisições, sem disco, sem processo longo (Vercel).

## Decisões já tomadas (diferenças em relação à especificação)

| Tema | Decisão | Motivo |
|---|---|---|
| Serwist | `@serwist/turbopack`; `cacheComponents` desligado | Turbopack é o padrão do Next 16; a integração exige `dynamic = "force-static"` |
| S3 local | RustFS no lugar do MinIO | `minio/minio` saiu do Docker Hub |
| Fonte | Fontes do sistema, sem `next/font/google` | O build não depende de baixar fontes; nada externo na área do motorista |
| Config do Prisma | `prisma.config.ts` | O Prisma 7.10 prefere `prisma7.config.ts`, mas ainda lê o nome antigo |
| Relações | Chave estrangeira composta (`companyId` + `id`) | O banco passa a impedir vínculo entre empresas |
| `OrderItem`, `RecurringOrderTemplateItem` | Ganharam `companyId` | "Toda tabela de negócio tem companyId" (seção 3.4) |
| `DeliveryProof.clientRequestId` | Único por empresa, não global | Um UUID de outra empresa não pode gerar erro que revele existência |
| `Route.cashHandedInCents` | Campo novo | A seção 5.8 manda gravar o dinheiro entregue no caixa e o modelo não tinha onde |
| `FileObject.deletedAt` | Campo novo | A seção 6 manda "marcar no banco" o arquivo apagado pela retenção |
| `AuditLog.userId` | Opcional | Ações do cron não têm usuário |
| CNPJ | Aceita letras nas 12 primeiras posições | CNPJ alfanumérico em vigor desde julho de 2026 |
| Rate limit em memória | `ALLOW_IN_MEMORY_RATE_LIMIT`, recusada na Vercel | E2E roda em build de produção local, sem Upstash |
| `db:reset` | Script próprio que só aceita `localhost` | Não há como apontar para banco remoto por engano |
| Vasilhames | `ceil(quantidade / unitsPerContainer)` por pedido; nulo = 1 por unidade | A especificação não define a conta |
| Login | Só e-mail e senha | **Decidido pelo dono do produto** (telefone não é único) |
| Novo ADMIN | ADMIN cria e promove ADMIN; nunca fica sem ADMIN ativo | **Decidido pelo dono do produto** |
| Reabrir rota liberada | Só ADMIN (vale a matriz da 5.1, não a 3.8) | **Decidido pelo dono do produto** |
| Página sem permissão | `notFound()`; área inteira sem acesso redireciona para o início do papel | `forbidden()` do Next ainda é experimental |
| Status da página negada | 200 com a tela "não encontrada" | O `loading.tsx` do painel inicia o streaming antes da checagem; nenhum dado vaza |
| Login | Carregamento completo da página de destino, não navegação interna | O documento precisa nascer dentro do escopo do service worker (`/motorista`) |
| `pausedUntil` | Inclusivo: pausado até o dia 26 não gera no dia 26 | A especificação não define |
| "Recebido" no dashboard | Dinheiro + Pix já conferido; Pix informado fica em "Pix a conferir" | Seção 5.8: Pix não conta como recebido antes da conferência |
| Fuso no cadastro | Lista dos 4 fusos do Brasil | `Company.timezone` precisa ser definido em algum lugar |
| E-mail | Sempre minúsculo, garantido também por CHECK no banco | Evita duas contas para o mesmo e-mail |
| `@hookform/resolvers` | 5.9.2 | A linha 7.x tem semanas de vida e trocou de versão maior duas vezes em um mês |

## Perguntas em aberto para o dono do produto

1. **Reagendamento (Fase 3).** A seção 3.8 diz `NAO_ENTREGUE → PENDENTE` no mesmo pedido, mas o modelo tem `rescheduledFromOrderId` (pedido novo) e o comprovante é único por pedido. Reagendar no mesmo pedido impede o segundo comprovante. Proposta: criar pedido novo ligado ao original, que continua `NAO_ENTREGUE`.
2. **Valor a cobrar na entrega parcial (Fase 5).** O valor recalculado substitui `amountToCollectCents` do pedido ou fica só no comprovante? Isso muda o "esperado" do fechamento.
3. **ADMIN na área do motorista (Fase 5).** A matriz dá ao ADMIN "ver suas rotas e finalizar entregas", mas rota só é atribuída a MOTORISTA. Hoje o ADMIN entra em `/motorista` e vê só rotas atribuídas a ele (nenhuma). Ele deveria poder finalizar entregas de qualquer rota (ex.: celular do motorista quebrou)?
4. **Configurações da empresa.** Nenhuma fase lista a tela para editar nome, CNPJ, fuso, política de comprovante e retenção de arquivos, mas a matriz tem a permissão. Em qual fase entra?

## Situação

- **Fase 1:** código, testes e build prontos. Pendente: o deploy de preview na Vercel, que exige contas de Vercel, Neon/Supabase, R2 e Upstash (passo a passo no README).
- **Fase 2:** pronta. O botão "gerar" do alerta de recorrentes no dashboard entra com o gerador (Fase 3). A limpeza do IndexedDB e o bloqueio de logout com entregas na fila entram com a fila (Fase 5). Rate limit dos endpoints do motorista entra com os endpoints (Fase 5).
- Deixados para a fase que os consome: cálculo do fechamento (Fase 6) e lógica da fila offline (Fase 5).
