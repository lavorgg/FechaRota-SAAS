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
pnpm test:e2e          # Playwright sobre o build de produção
```

Componentes do shadcn/ui: `pnpm dlx shadcn@4.23.0 add <componente>` (base Radix). Depois de adicionar, fixe as versões novas no `package.json` sem `^`.

Neste contêiner de nuvem o Playwright precisa de `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`, e o Docker precisa ser iniciado à mão (`dockerd &`).

## Regras que não podem ser quebradas

- Dinheiro: `Int` em centavos. Quantidade: milésimos no código, `Decimal(10,3)` no banco. Nunca `Float`.
- Data de entrega: texto `YYYY-MM-DD` e `@db.Date`. "Hoje" sempre por `todayInTimeZone(company.timezone)`.
- Banco em `app/` e `components/`: só por `getTenantDb(session)`. O ESLint bloqueia `lib/db`.
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

## Perguntas em aberto para o dono do produto

1. **Reagendamento (Fase 3).** A seção 3.8 diz `NAO_ENTREGUE → PENDENTE` no mesmo pedido, mas o modelo tem `rescheduledFromOrderId` (pedido novo) e o comprovante é único por pedido. Reagendar no mesmo pedido impede o segundo comprovante. Proposta: criar pedido novo ligado ao original, que continua `NAO_ENTREGUE`.
2. **Login por telefone (Fase 2).** O telefone não é único e o e-mail é obrigatório. Dois motoristas com o mesmo número, em empresas diferentes, ficam ambíguos. Proposta: login só por e-mail, ou telefone único em todo o sistema para MOTORISTA.
3. **Valor a cobrar na entrega parcial (Fase 5).** O valor recalculado substitui `amountToCollectCents` do pedido ou fica só no comprovante? Isso muda o "esperado" do fechamento.

## Situação

- **Fase 1:** código, testes e build prontos. Pendente: o deploy de preview na Vercel, que exige contas de Vercel, Neon/Supabase, R2 e Upstash (passo a passo no README).
- Deixados para a fase que os consome: cálculo do fechamento (Fase 6) e lógica da fila offline (Fase 5).
