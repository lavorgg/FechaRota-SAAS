# MVP SaaS de Romaneio, Rotas e Comprovação de Entrega (v3)

> Como usar: cole este arquivo inteiro como primeira mensagem para o agente de código (ou salve como `CLAUDE.md` na raiz do repositório). O agente deve executar **uma fase por vez** e **parar ao final de cada fase** para revisão humana.

---

## 0. Papel e regras de conduta do agente

Você é um engenheiro de software sênior full-stack, responsável por um produto SaaS B2B que **será vendido para empresas reais**. Erros aqui custam dinheiro do cliente (cobrança errada, mercadoria perdida, vazamento de dados entre empresas). Priorize **corretude e segurança acima de velocidade e de quantidade de features**.

Regras obrigatórias:

1. **Não confie na sua memória sobre APIs de bibliotecas.** Antes de escrever código para Next.js, Prisma, Tailwind, shadcn/ui, Serwist, Zod ou React Hook Form, verifique a versão instalada no `package.json` e siga a documentação oficial **daquela versão**. Várias delas tiveram breaking changes recentes (ver seção 2).
2. **Uma fase por vez.** Ao terminar cada fase: rode `typecheck`, `lint` e os testes; mostre o resultado; liste o que foi feito, o que ficou de fora e qualquer decisão que você tomou sozinho. Depois **pare e espere aprovação**.
3. **Sem placeholders, sem TODO, sem funções vazias** no que estiver dentro do escopo da fase. O que estiver fora de escopo (seção 10) **não deve ser iniciado**, nem como esqueleto.
4. **Se uma instrução deste documento for ambígua ou contraditória, pergunte antes de implementar.** Não invente regra de negócio.
5. **Toda mutação valida entrada com Zod no servidor**, verifica sessão, papel e `companyId`, e retorna erro em português, legível para o usuário final.
6. Nunca exponha stack trace, mensagem do Prisma ou ID interno de outra empresa ao usuário.
7. **O ambiente de produção é serverless (Vercel).** Não escreva código que dependa de disco local, memória compartilhada entre requisições ou processo de longa duração (ver seção 3.12).
8. Gerenciador de pacotes: **pnpm**, com `pnpm-lock.yaml` commitado. Commits pequenos e descritivos, um por unidade lógica de trabalho.

---

## 1. Produto: problema, público e posicionamento

**Público-alvo:** distribuidoras locais pequenas e médias (alimentos, bebidas, hortifrúti, laticínios, insumos) com frota própria de 1 a 15 veículos, que hoje operam com WhatsApp, planilha e romaneio em papel.

**Formato:** aplicação web **PWA**. Painel administrativo usado no computador; área do motorista **instalada no celular** (Android e iOS) e funcional com sinal ruim ou sem sinal.

**Problemas que o MVP resolve:**

1. **Lançamento de pedidos:** pedidos chegam por WhatsApp ou são recorrentes (mesmo cliente, mesmo dia da semana). Precisam ser lançados em segundos.
2. **Montagem de carga e rota:** agrupar pedidos por Cidade > Bairro, definir a sequência de paradas, gerar o **Romaneio de Carga** (conferência na doca) e o **Romaneio de Entrega** (sequência do motorista + o que cobrar).
3. **Comprovação de entrega:** o motorista registra no celular cada entrega com foto, assinatura, valor recebido, devolução parcial e caixas/vasilhames retornáveis.
4. **Acerto do motorista:** no fim do dia, conferir o que saiu, o que voltou, quanto foi recebido e o saldo de vasilhames.

**Posicionamento (importante para não prometer o que não entrega):**

- O MVP **não é um otimizador de rotas**. A sequência de paradas é definida manualmente, com agrupamento por bairro. Não usar a palavra "otimização" na interface.
- O MVP **não emite NF-e**. O romaneio é documento operacional, **não substitui a nota fiscal**. O pedido tem campo opcional para o número da NF-e emitida no ERP do cliente, e esse número aparece nos romaneios.
- O "Canhoto Digital" deve se chamar **"Comprovante de Entrega"** na interface. Não afirmar validade jurídica equivalente ao canhoto da NF-e.

---

## 2. Stack e infraestrutura (versões fixadas)

Fixe versões exatas no `package.json` (sem `^`) depois de instalar.

| Camada | Escolha | Observações críticas |
|---|---|---|
| Runtime | Node.js 22 LTS | Prisma 7 exige Node ≥ 20.19. Configurar a mesma versão na Vercel |
| Framework | **Next.js 16** (App Router), TypeScript `strict: true` + `noUncheckedIndexedAccess: true` | `middleware.ts` virou `proxy.ts`; `params` e `searchParams` são assíncronos; Turbopack é o bundler padrão |
| UI | Tailwind CSS v4 + **shadcn/ui** (Radix) + `lucide-react` | Usar componentes do shadcn/ui para Dialog, Sheet/Drawer, Command (combobox), Select, Toast/Sonner, Table, Form. **Não criar** esses componentes do zero |
| Drag-and-drop | `@dnd-kit` | Sempre acompanhado de botões subir/descer |
| Formulários | React Hook Form + Zod 4 (`@hookform/resolvers`) | Os mesmos schemas Zod são usados no cliente e no servidor |
| PWA | **Serwist** (service worker) + Web App Manifest | **Não usar `next-pwa`** (abandonado). Ver seção 3.13 sobre a integração com Turbopack |
| Armazenamento local no celular | IndexedDB via `idb-keyval` (ou `idb`) | Dados da rota e fila de envios offline |
| Banco | **PostgreSQL 16** gerenciado — **Neon ou Supabase (somente o banco), região São Paulo `sa-east-1`** (confirmar a disponibilidade da região ao criar o projeto) | Local: Postgres no Docker Compose. **Não usar SQLite** (migrations do Prisma são específicas do provider) |
| ORM | **Prisma 7** com `@prisma/adapter-pg` | Exige `prisma.config.ts`, `output` explícito no generator, driver adapter e carregamento manual do `.env` (`import "dotenv/config"`) |
| Arquivos (fotos/assinaturas) | **Cloudflare R2** (API S3) via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | Local: **MinIO** no Docker Compose, mesmo código S3 nos dois ambientes. **Nunca** salvar arquivo em disco do servidor nem em base64 no banco |
| Rate limiting | **Upstash Redis** + `@upstash/ratelimit` | Em dev, fallback em memória **somente** se `NODE_ENV=development` |
| Tarefas agendadas | **Vercel Cron** chamando Route Handlers protegidos por `CRON_SECRET` | |
| Hospedagem | **Vercel**, funções na região **`gru1` (São Paulo)**, plano Pro (uso comercial) | Banco e R2 o mais próximo possível de São Paulo |
| Autenticação | Implementação própria e simples (ver seção 5.1) | Sem provedor externo no MVP |
| Testes | Vitest (domínio e integração com banco de teste) + Playwright (E2E) | |

Scripts obrigatórios no `package.json`: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `db:deploy`, `db:seed`, `db:reset`.

`docker-compose.yml` local com: Postgres (dev), Postgres (teste, porta separada), MinIO (com bucket criado automaticamente na subida).

---

## 3. Decisões de engenharia que não são negociáveis

Cada uma destas evita uma classe conhecida de bug. Não substitua por alternativa "mais simples".

### 3.1 Dinheiro

- Todo valor monetário é **`Int` em centavos** (`priceCents`, `totalCents`, `cashCollectedCents`...).
- Nunca usar `Float`. Não usar `Decimal` para dinheiro (o objeto Decimal do Prisma não é serializável para Client Components e gera bugs de conversão).
- Formatação apenas na borda: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Input de dinheiro: o usuário digita "12,50"; uma função única `parseBRLToCents` converte. Testar com: `"12,5"`, `"12,50"`, `"1.234,56"`, `"0,01"`, `""`, `"abc"`, valores negativos.

### 3.2 Quantidade

- `quantity` é `Decimal(10,3)` (produtos em KG podem ter 2,750 kg). Nas demais unidades (CX, DZ, FD, UN, PCT), validar no Zod que é inteiro.
- Toda saída do banco passa por um **mapper/DTO** que converte Decimal para `string` ou `number` antes de chegar a qualquer componente. Nunca passar entidade Prisma crua para Client Component.
- Subtotal = `round(quantity × priceCents)` calculado **no servidor**, com regra de arredondamento documentada e testada.

### 3.3 Datas e fuso horário

- `Company.timezone` (padrão `America/Sao_Paulo`).
- **Data de entrega é data de calendário, não instante:** usar `@db.Date` no Postgres e trafegar como string `YYYY-MM-DD`. Isso evita o bug clássico de o pedido aparecer no dia anterior por conversão UTC.
- "Hoje" é sempre calculado no fuso da empresa, no servidor. Os servidores da Vercel rodam em UTC: **nunca** usar `new Date().getDay()` ou `toDateString()` sem fuso explícito.
- Instantes reais (`deliveredAt`, `startedAt`, `createdAt`) são `DateTime` em UTC, exibidos no fuso da empresa.

### 3.4 Multi-tenancy (isolamento entre empresas)

- Toda tabela de negócio tem `companyId` com índice.
- **Proibido** chamar o client Prisma global dentro de páginas, Server Actions ou Route Handlers. Todo acesso passa por `getTenantDb(session)`, que retorna um client com **Prisma Client Extension** que injeta `companyId` em todo `where` de leitura/update/delete e em todo `data` de create.
- Busca por ID de outra empresa retorna **404** (não 403), para não revelar existência.
- Relações entre registros (ex.: pedido → cliente, rota → motorista) devem ser validadas como pertencentes à **mesma** empresa antes de gravar.
- Chaves de arquivo no R2 sempre prefixadas: `companies/{companyId}/...`. O servidor nunca gera URL de leitura para chave de outra empresa.
- Testes automatizados obrigatórios: com duas empresas no banco, a empresa B não consegue ler, editar, listar, imprimir, baixar arquivos nem finalizar nada da empresa A, em **todas** as Server Actions e Route Handlers.

### 3.5 Autorização

- Verificação de sessão e papel acontece **em cada Server Action, Route Handler e página do servidor**. O `proxy.ts` pode redirecionar quem não está logado, mas **não é a camada de segurança**.
- Matriz de permissão em um único arquivo (`lib/auth/permissions.ts`) e testada.

### 3.6 Numeração sequencial por empresa

- `orderNumber` e `Route.code` usam a tabela `CompanyCounter (companyId, key, value)` com incremento atômico dentro da mesma transação que cria o registro. Nunca usar `max()+1` (gera número duplicado com dois usuários simultâneos).
- Unicidade composta: `@@unique([companyId, orderNumber])`, `@@unique([companyId, code])`, `@@unique([companyId, sku])`, `@@unique([companyId, plate])`. E-mail de usuário é único globalmente.

### 3.7 Snapshot de dados no pedido

- `OrderItem` grava `productName`, `unit` e `unitPriceCents` no momento do pedido. Alterar o preço ou o nome do produto depois **não altera** pedidos existentes nem romaneios já impressos.
- O pedido grava o snapshot do endereço de entrega (rua, número, bairro, cidade, referência). Romaneio impresso deve bater com o que foi carregado, mesmo que o cadastro do cliente mude.

### 3.8 Máquina de estados explícita

Transições permitidas ficam em um módulo puro (`domain/order-status.ts`, `domain/route-status.ts`) com testes. Qualquer transição fora da lista é rejeitada no servidor.

**Pedido:**

- `PENDENTE → EM_ROTA` (quando a rota é liberada para carga)
- `PENDENTE → CANCELADO`
- `EM_ROTA → ENTREGUE | ENTREGUE_PARCIAL | NAO_ENTREGUE`
- `EM_ROTA → PENDENTE` (somente se a rota voltar para `RASCUNHO`, por ADMIN, com registro em auditoria)
- `NAO_ENTREGUE → PENDENTE` (reagendar para outra data: mantém histórico e vínculo com o pedido original)
- `ENTREGUE`, `ENTREGUE_PARCIAL` e `CANCELADO` são finais. Correção posterior só por ADMIN, com motivo obrigatório e registro em auditoria.

**Rota:**

- `RASCUNHO → LIBERADA_CARGA → EM_ANDAMENTO → AGUARDANDO_ACERTO → CONCLUIDA`
- `LIBERADA_CARGA → RASCUNHO` (somente ADMIN/EXPEDICAO, antes do início)
- Em `RASCUNHO`: pode adicionar/remover pedidos e reordenar. A partir de `LIBERADA_CARGA`: composição congelada.
- `EM_ANDAMENTO` começa quando o motorista toca em "Iniciar rota". `AGUARDANDO_ACERTO` quando todas as paradas têm desfecho. `CONCLUIDA` somente após o acerto na tela de fechamento.
- Um motorista não pode ter duas rotas `EM_ANDAMENTO` ao mesmo tempo.

### 3.9 Idempotência

- Gerar pedidos recorrentes: `@@unique([recurringTemplateId, deliveryDate])` em Order. Rodar o gerador duas vezes não duplica nada e informa quantos foram criados e quantos já existiam.
- Finalização de entrega pelo motorista: cada envio tem `clientRequestId` (UUID gerado no celular). O servidor guarda e ignora reenvios com o mesmo ID, devolvendo o resultado original. Essencial porque o envio será repetido quando o sinal cair.

### 3.10 Concorrência

- Rota e Pedido têm campo `version Int`. Atualizações usam `where: { id, version }` e incrementam. Se nenhuma linha for afetada, retornar "Este registro foi alterado por outra pessoa. Recarregue a página."

### 3.11 Auditoria

- Tabela `AuditLog (companyId, userId, entity, entityId, action, before Json?, after Json?, reason?, createdAt)`.
- Registrar no mínimo: cancelamento de pedido, alteração de pedido após `EM_ROTA`, liberação/reabertura de rota, finalização de entrega, confirmação de Pix no acerto, ajustes no fechamento, alteração de papel de usuário.

### 3.12 Regras do ambiente serverless (Vercel)

- **Sem disco persistente.** Nada é gravado no sistema de arquivos em runtime. Todo arquivo vai para o R2.
- **Limite de 4,5 MB no corpo de qualquer requisição** a funções da Vercel (Server Actions e Route Handlers), sem configuração que mude isso. Server Actions têm ainda limite padrão de 1 MB. Por isso **fotos e assinaturas sobem direto do navegador para o R2** com URL pré-assinada (seção 5.7). Nenhum arquivo binário passa pelas funções.
- **Sem estado em memória entre requisições.** Rate limit no Upstash; nada de cache, fila ou contador em variável global.
- **Conexões com o banco:**
  - `DATABASE_URL` = endereço **com pooling** (pooler do Neon/Supabase), usado pelo app em runtime via `@prisma/adapter-pg`.
  - `DIRECT_URL` = endereço **direto**, usado apenas pela CLI do Prisma (migrations) no `prisma.config.ts`.
  - PrismaClient instanciado como singleton em `lib/db.ts` (protegido contra recriação no hot reload em dev).
- **Ambientes isolados:**
  - Produção, Preview e Development têm bancos e buckets separados. **Deploy de preview nunca aponta para o banco de produção.** Usar branch de banco (Neon) ou banco separado para preview.
  - Migrations em produção com `prisma migrate deploy`, executadas no build somente quando `VERCEL_ENV=production` (ou em etapa de CI documentada). Nunca `migrate dev` ou `db push` fora da máquina local.
- **Região:** `vercel.json` com `"regions": ["gru1"]`.
- **Variáveis de ambiente:** validadas na inicialização com um schema Zod (`lib/env.ts`); o app falha no build se faltar alguma. `.env.example` completo e comentado.

### 3.13 PWA e service worker

- Integração do Serwist com Next.js 16: há dois caminhos — a integração com Turbopack (`@serwist/turbopack`) ou a integração clássica (`@serwist/next`), que exige `next build --webpack`. **Na Fase 1, consulte a documentação atual do Serwist, escolha um, justifique no resumo da fase e use somente ele.** Não misture os dois.
- Service worker **desativado em `next dev`**; testar o PWA com `pnpm build && pnpm start` e em deploy de preview.
- **Escopo do cache offline: somente a área do motorista** (`/motorista/**`) e seus assets estáticos. O painel administrativo não funciona offline e não deve ser cacheado.
- **Dados de negócio nunca ficam no cache do service worker.** Dados da rota ficam no IndexedDB, controlados pelo código do app. O service worker cuida só do app shell (HTML/JS/CSS/ícones) para a página abrir sem sinal.
- **Atualização de versão:** quando houver service worker novo, mostrar aviso "Nova versão disponível — Atualizar". **Nunca recarregar automaticamente** (o motorista pode estar no meio de uma entrega).
- **Não depender de Background Sync**: o Safari/iOS não suporta. A fila envia quando o app está aberto (evento `online`, ao abrir o app, ao voltar ao primeiro plano via `visibilitychange`, tentativas periódicas com backoff e botão manual).
- **Persistência no iOS:** chamar `navigator.storage.persist()` ao abrir a área do motorista. O iOS pode apagar dados de sites não instalados, por isso a instalação na tela inicial é **obrigatória** para o motorista (ver 5.7).

---

## 4. Modelo de dados

Implemente o `schema.prisma` com as entidades abaixo. Campos marcados `?` são opcionais. IDs `cuid()` ou `uuid()`. Toda entidade de negócio tem `createdAt` e `updatedAt`.

**Company**: `id, name, cnpj?, phone?, timezone (default "America/Sao_Paulo"), planStatus (TRIAL | ACTIVE | PAST_DUE | CANCELED), trialEndsAt, proofPolicy (SIGNATURE_REQUIRED | PHOTO_OR_SIGNATURE), fileRetentionMonths (default 12)`.

- Regra: `PAST_DUE` ou `CANCELED` → painel somente leitura com aviso de pagamento pendente. O motorista **sempre** consegue finalizar a rota que está em andamento (não travar operação de rua por cobrança).

**User**: `id, companyId, name, email (único global), phone?, passwordHash, role (ADMIN | EXPEDICAO | MOTORISTA), active`.

**Session**: `id, userId, tokenHash, expiresAt, createdAt, userAgent?`.

**CompanyCounter**: `companyId, key, value` com `@@id([companyId, key])`.

**Vehicle**: `id, companyId, plate, model, capacityKg?, active`.

**Customer**:

- `id, companyId, name, legalName?, document? (CPF ou CNPJ, apenas dígitos, validar dígito verificador), phone? (normalizado só com dígitos e DDI 55), active`.
- Endereço: `zipCode, street, number, complement?, neighborhood, city, state (UF de 2 letras), referencePoint?, latitude?, longitude?`.
- Campos de agrupamento normalizados: `neighborhoodKey` e `cityKey` (minúsculo, sem acento, sem espaços duplicados) com índice `@@index([companyId, cityKey, neighborhoodKey])`. **Agrupar sempre pela chave normalizada**, exibir o nome original. Evita "Centro", "centro" e "Centro " virarem três bairros.
- Comercial: `defaultPaymentMethod (PIX | DINHEIRO | BOLETO | FATURADO), deliveryWindow? (texto livre), notes?`.
- **Não existe `recurringDays` no cliente.** A fonte única de verdade da recorrência é `RecurringOrderTemplate`.

**Product**: `id, companyId, sku, name, unit (CX | DZ | FD | KG | UN | PCT), priceCents, weightKg? (peso por unidade), isReturnableContainer, containerProductId? (produto retornável em que este item sai), unitsPerContainer?, active`.

**RecurringOrderTemplate**: `id, companyId, customerId, dayOfWeek (DOM | SEG | TER | QUA | QUI | SEX | SAB), active, startsOn (date), pausedUntil? (date), notes?`, com itens `RecurringOrderTemplateItem (productId, quantity, unitPriceCents? — se nulo, usa o preço atual do produto na geração)`. Um cliente pode ter vários templates.

**Order**:

- `id, companyId, orderNumber, customerId, recurringTemplateId?, routeId?, stopSequence?, deliveryDate (@db.Date), status, version`.
- Snapshot do endereço (ver 3.7).
- `invoiceNumber?` (número da NF-e emitida fora do sistema).
- Financeiro: `paymentMethod`, `totalCents`, `amountToCollectCents` (0 se BOLETO ou FATURADO), `paymentStatus (A_RECEBER | RECEBIDO | PIX_A_CONFERIR | FATURADO | NAO_RECEBIDO)`.
- `notes?`, `cancelReason?`, `rescheduledFromOrderId?`.
- `@@unique([companyId, orderNumber])`, `@@unique([recurringTemplateId, deliveryDate])`, `@@index([companyId, deliveryDate, status])`.

**OrderItem**: `id, orderId, productId, productName, unit, quantity, unitPriceCents, subtotalCents, deliveredQuantity?, returnReason?`.

**Route**: `id, companyId, code, name, deliveryDate (@db.Date), driverId, vehicleId?, status, notes?, startedAt?, finishedAt?, closedAt?, closedById?, version`.

**DeliveryProof** (Comprovante de Entrega), um por pedido:

- `id, orderId (unique), companyId, clientRequestId (unique), outcome (ENTREGUE | ENTREGUE_PARCIAL | NAO_ENTREGUE), deliveredAt (horário registrado no celular), receivedAt (horário em que o servidor recebeu), receiverName?, receiverDocument?, signatureFileKey?, photoFileKeys (até 3), failureReason? (ESTABELECIMENTO_FECHADO | PEDIDO_RECUSADO | ENDERECO_NAO_LOCALIZADO | CLIENTE_SEM_DINHEIRO | AVARIA | OUTRO), failureNote?, cashCollectedCents, pixCollectedCents, latitude?, longitude?, accuracyMeters?, recordedById`.
- Validação conforme `Company.proofPolicy`.

**ContainerMovement** (razão de vasilhames por cliente): `id, companyId, customerId, containerProductId, orderId?, routeId?, delivered Int, returned Int, createdAt`. Saldo do cliente = soma(delivered) − soma(returned).

**FileObject**: `key, companyId, kind (PHOTO | SIGNATURE), mimeType, sizeBytes, status (PENDING | CONFIRMED), uploadedById, createdAt, confirmedAt?`.

**AuditLog**: ver 3.11.

---

## 5. Funcionalidades

### 5.1 Autenticação e contas

- Login com e-mail (ou telefone, para motoristas) e senha. Hash com `bcryptjs` (custo 12) ou `argon2`.
- Sessão em tabela `Session`; cookie `HttpOnly`, `Secure` em produção, `SameSite=Lax`. Expiração: 30 dias para motorista, 12 horas para painel.
- **Rate limit de login com Upstash** (por e-mail + IP), além de rate limit nos endpoints do motorista.
- **Cadastro de nova empresa** (`/cadastro`): cria Company em `TRIAL` (14 dias) + usuário ADMIN.
- ADMIN cria usuários EXPEDICAO e MOTORISTA.
- **Celular compartilhado entre motoristas:** no logout, apagar IndexedDB e caches de dados do usuário. **Bloquear o logout se houver entregas na fila sem envio**, com aviso claro.
- **Troca rápida de perfil para testes** (Admin ↔ Motorista): somente quando `NODE_ENV=development` **e** `ENABLE_DEV_IMPERSONATION=true`. Inalcançável em produção e preview, com teste que garante isso.

**Matriz de permissões:**

| Ação | ADMIN | EXPEDICAO | MOTORISTA |
|---|---|---|---|
| Cadastros (clientes, produtos, veículos) | ✅ | ✅ | ❌ |
| Usuários e configurações da empresa | ✅ | ❌ | ❌ |
| Criar/editar pedidos e gerar recorrência | ✅ | ✅ | ❌ |
| Montar e liberar rota | ✅ | ✅ | ❌ |
| Reabrir rota liberada | ✅ | ❌ | ❌ |
| Ver suas rotas e finalizar entregas | ✅ | ❌ | ✅ (somente rotas atribuídas a ele) |
| Fechamento/acerto de rota | ✅ | ✅ | ❌ |
| Corrigir entrega já finalizada | ✅ (com motivo) | ❌ | ❌ |

### 5.2 Layout base

- Painel (`/app/...`): sidebar recolhível (shadcn/ui), seletor de data global no topo (padrão: hoje no fuso da empresa).
- Motorista (`/motorista/...`): layout próprio, sem sidebar, fonte mínima 16px, alvos de toque de no mínimo 48×48px, contraste AA, uso com uma mão (ações principais na metade inferior da tela).
- Estados obrigatórios em toda listagem: carregando, vazio (com ação sugerida) e erro.

### 5.3 Dashboard (`/app/dashboard`)

KPIs da data selecionada:

- Pedidos do dia (total e por status).
- **Valor a receber na entrega** vs. **valor recebido** (dinheiro + Pix), e quanto está `PIX_A_CONFERIR`. Não chamar de "faturamento".
- Rotas por status.
- Entregas concluídas vs. pendentes vs. não entregues.

Alertas:

- Templates recorrentes do dia da semana da data selecionada que ainda não geraram pedido (com botão para gerar).
- Pedidos `NAO_ENTREGUE` sem reagendamento.
- Pedidos `PENDENTE` da data sem rota.
- Rotas `AGUARDANDO_ACERTO` há mais de 12 horas.

### 5.4 Cadastros

- CRUD de Clientes, Produtos, Veículos e Usuários, com busca, paginação no servidor e inativação (soft delete). Não permitir excluir registros com pedidos vinculados.
- CEP: botão "Buscar CEP" via ViaCEP, timeout de 3s, preenchimento manual como alternativa. Falha na consulta nunca bloqueia o cadastro.
- **Importação de clientes e produtos por CSV**: modelo para download, pré-visualização, relatório de linhas com erro e motivo. O CSV é lido no navegador e enviado ao servidor em lotes de JSON (respeitando o limite de corpo da seção 3.12).

### 5.5 Pedidos (`/app/pedidos`)

**Lançamento rápido (Sheet/Drawer do shadcn/ui):**

- Busca de cliente (componente Command) por nome, bairro ou telefone; debounce de 200ms; busca no servidor sem diferenciar maiúsculas nem acentos.
- Ao selecionar o cliente: mostra forma de pagamento padrão, janela de entrega e o **último pedido**, com botão "Repetir último pedido".
- Itens: busca de produto por SKU ou nome; `Enter` adiciona; `Tab` vai para quantidade; atalhos visíveis na tela.
- Total recalculado ao vivo no cliente e **de novo no servidor**. O servidor é a fonte da verdade e nunca confia em preço ou total enviado pelo navegador.
- Opção "Salvar também como pedido recorrente", com seleção do dia da semana.
- Aviso se o cliente já tem pedido para a mesma data (permitir com confirmação).

**Gerador de recorrência:**

- Botão "Gerar pedidos recorrentes para [data]". Lê templates ativos do dia da semana, respeita `startsOn` e `pausedUntil`, ignora clientes e produtos inativos (e lista quais foram ignorados e por quê).
- Tudo em uma transação. Resultado: "X pedidos criados, Y já existiam, Z ignorados".

**Listagem:** filtros por data, status, bairro, cliente e rota. Ações: editar (só `PENDENTE`), cancelar com motivo, reagendar.

### 5.6 Montagem de rotas (`/app/rotas`)

**Agrupador:**

- Pedidos `PENDENTE` sem rota na data, agrupados por Cidade > Bairro (chave normalizada), com quantidade de pedidos, peso estimado (soma de `quantity × weightKg`; mostrar "peso incompleto" se algum produto não tiver peso), volumes e valor total.
- Selecionar bairro inteiro ou pedidos individuais.

**Construtor:**

- Atribuir motorista (só usuários MOTORISTA ativos) e veículo.
- Aviso (não bloqueio) se o peso estimado passar de `capacityKg`.
- Ordenar paradas com botões subir/descer **e** drag-and-drop (`@dnd-kit`).
- Ordem inicial sugerida: por bairro e, dentro do bairro, por rua e número. Deixar claro na interface que é uma ordenação simples, não otimização.
- Botão "Abrir rota no Google Maps", com URL de direções e as paradas na ordem. Se passar do limite de waypoints da URL, dividir em trechos, com um botão por trecho.
- "Liberar para carga" congela a rota, muda os pedidos para `EM_ROTA` e habilita a impressão.

**Romaneios (impressão A4 via `@media print`):**

- **Romaneio de Carga:** cabeçalho (empresa, código e versão da rota, data, motorista, veículo, placa), tabela consolidada por produto (SKU, nome, unidade, quantidade total, peso), total de vasilhames a carregar, espaço para assinatura do conferente e do motorista.
- **Romaneio de Entrega:** uma seção por parada, na ordem, com nº da parada, nº do pedido, nº da NF-e (se houver), cliente, endereço completo, ponto de referência, telefone, janela de entrega, itens, valor a cobrar e forma de pagamento (ou "FATURADO — não cobrar"), saldo de vasilhames do cliente e campo para assinatura e nome legível do recebedor.
- Regras de impressão: `thead` repetido em cada página, `break-inside: avoid` por parada, legível em P&B (sem depender de cor de fundo), data/hora de geração e versão da rota no cabeçalho.

### 5.7 Área do motorista — PWA (`/motorista`)

**Instalação (obrigatória):**

- Web App Manifest: `name`, `short_name`, `start_url: "/motorista"`, `scope: "/motorista"`, `display: "standalone"`, `theme_color`, `background_color`, ícones 192 e 512 (incluindo `maskable`) e `apple-touch-icon`.
- Android/Chrome: capturar `beforeinstallprompt` e mostrar botão "Instalar aplicativo".
- iOS/Safari: não existe prompt automático. Detectar iOS fora do modo standalone e mostrar uma tela com instruções ilustradas ("Toque em Compartilhar → Adicionar à Tela de Início").
- Se o motorista abrir pelo navegador sem instalar, mostrar aviso persistente de que o modo offline só é confiável com o app instalado.

**Lista:** rotas do motorista logado para hoje (fuso da empresa). Botão "Iniciar rota", que baixa e salva no IndexedDB a rota completa (paradas, itens, valores, saldos de vasilhames).

**Card da parada atual:**

- Nº da parada / total, cliente, endereço completo, ponto de referência, janela de entrega.
- **"Navegar"**: Google Maps (`https://www.google.com/maps/search/?api=1&query=` com lat/long se houver, senão endereço codificado) e opção Waze.
- **"WhatsApp"**: `https://wa.me/55DDDNUMERO` com mensagem pré-preenchida opcional.
- Itens do pedido.
- Faixa de cobrança em destaque: **vermelha "COBRAR R$ X — PIX/DINHEIRO"** ou **verde "FATURADO — NÃO COBRAR"**, sempre com ícone e texto (não depender só de cor).
- Saldo de vasilhames do cliente.
- Tudo isso funciona **sem sinal**, a partir do IndexedDB.

**Finalizar entrega (Comprovante):**

1. Desfecho: Entregue / Entregue parcialmente / Não entregue.
2. Se parcial: para cada item, quantidade entregue (stepper `+`/`−`) e motivo da devolução. O valor a cobrar é recalculado.
3. Se não entregue: motivo da lista + observação opcional; foto recomendada.
4. Recebimento: dinheiro e Pix em campos separados. Valor sugerido = valor a cobrar. Se o total for diferente do esperado, exigir confirmação.
5. Vasilhames: entregues (pré-preenchido) e recolhidos (stepper).
6. Nome do recebedor (documento opcional).
7. Assinatura e foto (até 3).
8. Confirmar → a entrega vai para a fila local e a próxima parada aparece **imediatamente**, sem esperar a rede.

**Assinatura (canvas):**

- Pointer Events (dedo, caneta e mouse), `touch-action: none` no canvas.
- Escalar pelo `devicePixelRatio`; redimensionar corretamente ao girar a tela.
- Botão "Limpar". Rejeitar assinatura vazia ou com traço insignificante.
- Exportar PNG com fundo branco, recortado na área desenhada.

**Foto:**

- `<input type="file" accept="image/*" capture="environment">`. Alguns aparelhos ignoram `capture` e abrem a galeria; aceitável.
- Compressão no cliente: lado maior 1600px, JPEG qualidade ~0,7, respeitando a orientação EXIF (`createImageBitmap(file, { imageOrientation: 'from-image' })`). Meta: < 400 KB por foto.
- Pré-visualização com opção de remover.

**Geolocalização:** solicitar no momento da confirmação, timeout de 5s. Negada ou indisponível → seguir sem ela. **Nunca bloquear a entrega por falta de GPS.** Sem rastreamento contínuo.

**Fila offline e sincronização (fluxo obrigatório):**

1. Cada entrega confirmada é salva no IndexedDB com `clientRequestId`, dados do formulário e os arquivos já comprimidos (Blob).
2. Quando houver conexão, para cada item da fila, em ordem:
   a. `POST /api/motorista/uploads/presign` com `clientRequestId` e a lista de arquivos (tipo e tamanho). O servidor valida sessão, rota, tipo (`image/jpeg`, `image/png`), tamanho máximo (2 MB por arquivo) e quantidade; cria `FileObject` em `PENDING`; devolve URLs PUT pré-assinadas do R2 (expiração de 10 minutos) com chaves `companies/{companyId}/proofs/{orderId}/{uuid}.jpg`.
   b. O navegador envia cada arquivo **direto para o R2** (`PUT`).
   c. `POST /api/motorista/entregas` com JSON (dados + chaves dos arquivos + `clientRequestId`). O servidor confere com `HeadObject` que cada arquivo existe, tem tamanho e tipo coerentes e pertence ao prefixo da empresa; marca os `FileObject` como `CONFIRMED`; grava o comprovante, os movimentos de vasilhame e o novo status em **uma transação**.
   d. Se o `clientRequestId` já foi processado, o servidor devolve o resultado anterior sem gravar nada de novo.
3. Disparo do envio: evento `online`, abertura do app, `visibilitychange` para visível, tentativas periódicas com backoff exponencial (máximo de 5 minutos) e botão "Sincronizar agora".
4. Indicador sempre visível: "Tudo sincronizado" ou "3 entregas aguardando envio", com data da última sincronização.
5. Erro definitivo do servidor (ex.: rota reaberta pelo escritório, validação) → o item sai da fila automática e aparece em "Precisa de atenção", com a mensagem em português. Nunca descartar dado do motorista silenciosamente.
6. Avisar antes de fechar a página se houver itens pendentes (`beforeunload`).

**Bucket R2:** CORS liberando `PUT` e `GET` somente para os domínios do app (produção e previews). Regra de ciclo de vida ou cron para apagar objetos `PENDING` não confirmados em 24 horas.

### 5.8 Fechamento e acerto (`/app/rotas/[id]/fechamento`)

Para rotas `AGUARDANDO_ACERTO` (ou `EM_ANDAMENTO`, com aviso de paradas sem desfecho ou ainda não sincronizadas).

- **Mercadoria:** por produto, carregado vs. entregue vs. devolvido (parcial + não entregue). Diferenças destacadas.
- **Dinheiro:** esperado (soma de `amountToCollectCents` dos entregues) vs. recebido em dinheiro vs. recebido em Pix. Campo "Dinheiro entregue pelo motorista no caixa" e diferença (sobra/falta).
- **Pix:** lista de `PIX_A_CONFERIR` com checkbox "Confirmado no extrato". Pix informado pelo motorista **não conta como recebido** até essa confirmação.
- **Vasilhames:** saíram, foram deixados, voltaram; saldo da rota.
- **Pendências:** pedidos não entregues com ação de reagendar.
- **Comprovantes:** visualização das fotos e assinaturas por parada, carregadas por URL GET pré-assinada do R2 (expiração de 5 minutos), gerada somente após verificação de sessão e empresa.
- "Concluir acerto": grava valores, confirmações e diferenças, registra em auditoria, move a rota para `CONCLUIDA`. Resumo de acerto imprimível (A4).

---

## 6. LGPD e segurança

- Foto, assinatura, nome/documento do recebedor e localização são dados pessoais. Aviso curto na tela do comprovante ("Os dados são usados para comprovar a entrega").
- **Retenção:** Vercel Cron diário (`/api/cron/retencao`, protegido por `Authorization: Bearer ${CRON_SECRET}`) apaga do R2 e marca no banco arquivos mais antigos que `Company.fileRetentionMonths`. O mesmo cron remove `FileObject` `PENDING` com mais de 24 horas.
- Bucket R2 **privado**. Leitura só por URL pré-assinada de curta duração, gerada após checagem de empresa. Chaves com UUID (não adivinháveis).
- Headers de segurança (CSP compatível com o app, o service worker e o domínio do R2; `X-Content-Type-Options`; `Referrer-Policy`).
- Segredos só em variáveis de ambiente da Vercel, separadas por ambiente (Production / Preview / Development).
- Nenhum log com senha, token de sessão, URL pré-assinada ou documento completo.

---

## 7. Deploy (Vercel)

- Projeto na Vercel conectado ao repositório; `main` → produção; pull requests → preview.
- `vercel.json`: `regions: ["gru1"]`, crons da seção 6.
- Banco: Neon ou Supabase em `sa-east-1`. Produção e preview em bancos/branches separados.
- R2: buckets separados para produção e preview.
- Upstash Redis: uma instância por ambiente (ou prefixos de chave por ambiente).
- Build de produção: `prisma generate`, `prisma migrate deploy` (somente com `VERCEL_ENV=production`, usando `DIRECT_URL`) e `next build` (com `--webpack` se essa for a integração do Serwist escolhida).
- README com passo a passo completo: criar banco, bucket R2 + CORS, Upstash, variáveis de ambiente por ambiente, primeiro deploy, rodar seed em preview.
- **Uso comercial exige plano Pro da Vercel.** Registrar isso no README.

---

## 8. Seed de demonstração (`prisma/seed.ts`)

Datas **relativas a hoje** no fuso `America/Sao_Paulo` (o seed precisa funcionar em qualquer dia em que for rodado).

- 2 empresas (a segunda serve para testar isolamento), cada uma com dados próprios.
- Empresa principal "Distribuidora Exemplo": 1 ADMIN, 1 EXPEDICAO, 2 MOTORISTAS, 2 veículos.
- 8 produtos: 6 vendáveis (pelo menos 1 em KG com quantidade fracionada e pelo menos 2 vinculados a caixa retornável) + 2 retornáveis (caixa plástica, engradado).
- 12 clientes em 3 bairros de uma cidade + 1 bairro de outra cidade, incluindo grafias inconsistentes de bairro ("Centro", "centro ") para provar a normalização; mistura de PIX, DINHEIRO, BOLETO e FATURADO.
- 5 templates recorrentes, dos quais 2 caem no dia da semana de hoje e 1 já gerou pedido hoje (para testar a idempotência).
- 12 pedidos para hoje em `PENDENTE`.
- 1 rota de ontem já `CONCLUIDA`, com comprovantes (incluindo 1 parcial e 1 não entregue; arquivos de exemplo enviados ao MinIO/R2) e movimentos de vasilhame, para o dashboard e o fechamento terem dados.
- Credenciais impressas no terminal ao final do seed.
- `db:reset` recria o banco local e roda o seed do zero. **O seed se recusa a rodar se `VERCEL_ENV=production`.**

---

## 9. Testes obrigatórios

**Unitários (Vitest), lógica pura em `domain/`:**

- `parseBRLToCents` e formatação.
- Subtotal e total com quantidade fracionada.
- Transições de status de pedido e rota (todas as válidas passam, todas as inválidas falham).
- Consolidação do romaneio de carga (soma por produto, inclusive KG).
- Cálculo do fechamento (esperado vs. recebido, parciais, não entregues, vasilhames).
- Normalização de bairro/cidade.
- Validação de CPF/CNPJ.
- "Hoje" e dia da semana no fuso da empresa, testado perto da meia-noite UTC (21h em São Paulo).
- Lógica da fila offline (ordem, backoff, separação de erros definitivos), testada isolada do navegador.

**Integração (Vitest + Postgres de teste + MinIO):**

- Isolamento entre empresas em todas as actions e handlers, inclusive presign e leitura de arquivos.
- Gerador de recorrência rodado duas vezes = mesmo resultado.
- Reenvio do mesmo `clientRequestId` = um único comprovante.
- Finalização rejeitada se a chave do arquivo não existir no storage ou for de outra empresa.
- Dois pedidos criados em paralelo recebem números diferentes.
- Conflito de versão em edição concorrente de rota.
- Motorista não finaliza parada de rota de outro motorista.
- Cron recusa chamada sem `CRON_SECRET`.

**E2E (Playwright):**

- Painel: login → gerar recorrentes → montar rota por bairro → liberar → imprimir romaneios (validar conteúdo).
- Motorista em viewport de celular (390×844), sobre build de produção (`pnpm build && pnpm start`), com service worker ativo:
  - iniciar rota → entrega completa com assinatura e foto → entrega parcial → não entregue;
  - colocar o contexto offline (`context.setOffline(true)`), **recarregar a página** e confirmar que a área do motorista abre, finalizar duas entregas, voltar online e verificar a sincronização e a idempotência.
- Fechamento: números conferem com o seed.

---

## 10. Fora do escopo do MVP (não implementar)

- Otimização automática de rota (VRP/TSP) e geocodificação em lote.
- Emissão de NF-e, MDF-e, boleto ou integração bancária/Pix automática.
- Integração com ERPs (Bling, Tiny, Omie etc.). Só a importação CSV.
- App nativo (React Native/Expo).
- Rastreamento GPS em tempo real e push notifications.
- Funcionamento offline do painel administrativo.
- Tabela de preço por cliente, comissão, estoque.
- Cobrança da assinatura SaaS (gateway). `planStatus` é alterado manualmente.
- Envio automático de WhatsApp (API oficial). Só links `wa.me`.

---

## 11. Fases de execução e critérios de aceite

Cada fase termina com: `typecheck` ✅, `lint` ✅, testes da fase ✅, resumo para revisão. **Pare ao final de cada fase.**

**Fase 1 — Fundação e deploy vazio**

- Next.js 16 + TS estrito + Tailwind v4 + shadcn/ui + ESLint + pnpm.
- `docker-compose.yml` (Postgres dev, Postgres teste, MinIO).
- Prisma 7 (`prisma.config.ts`, adapter pg, output explícito, `DATABASE_URL`/`DIRECT_URL`, singleton em `lib/db.ts`).
- `lib/env.ts` validando variáveis com Zod.
- Schema completo da seção 4, migration inicial, seed da seção 8.
- `getTenantDb` com extension e testes de isolamento básicos.
- Módulos `domain/` com testes unitários.
- Abstração de storage S3 funcionando contra MinIO.
- Decisão documentada sobre a integração Serwist (seção 3.13), com manifest e service worker mínimos.
- **Primeiro deploy na Vercel** (preview) conectado a banco, R2 e Upstash de preview, com uma página de saúde (`/api/health`) que verifica banco e storage.
- **Aceite:** `docker compose up -d && pnpm install && pnpm db:reset && pnpm test` funciona do zero numa máquina limpa seguindo só o README; o deploy de preview responde `/api/health` com banco e storage OK.

**Fase 2 — Autenticação e layout**

- Login, sessão, logout, cadastro de empresa, gestão de usuários, matriz de permissões, rate limit com Upstash, impersonação só em dev.
- Layout do painel e do motorista; dashboard com dados do seed.
- **Aceite:** cada papel vê apenas o que a matriz permite (teste automatizado); impersonação inacessível fora de `development`.

**Fase 3 — Cadastros e pedidos**

- CRUDs, CEP, importação CSV em lotes, lançamento rápido, repetir último pedido, gerador de recorrência, listagem com filtros, cancelar e reagendar.
- **Aceite:** lançar um pedido de 5 itens só com teclado em menos de 30 segundos; gerador idempotente comprovado por teste.

**Fase 4 — Rotas e romaneios**

- Agrupador, construtor, ordenação, liberação, reabertura, impressão dos dois romaneios, link do Google Maps.
- **Aceite:** romaneio de carga bate com a soma manual dos pedidos do seed; impressão legível em P&B no Chrome (salvar como PDF e anexar ao resumo da fase).

**Fase 5 — Motorista (PWA)**

- Manifest completo, instalação (Android e instruções iOS), app shell offline, `storage.persist()`, rota no IndexedDB, parada atual, comprovante completo, upload direto ao R2 com URL pré-assinada, fila offline com sincronização idempotente, aviso de nova versão.
- **Aceite:** E2E do motorista passando, incluindo recarregar a página offline; fotos abaixo de 400 KB; Lighthouse (categoria PWA/instalabilidade) sem erros; checklist de teste manual em iPhone real e Android real incluído no resumo.

**Fase 6 — Fechamento, auditoria e endurecimento**

- Tela de acerto, confirmação de Pix, visualização de comprovantes, auditoria, cron de retenção, CORS do R2, headers de segurança, README de deploy completo, deploy de produção.
- **Aceite:** todos os testes da seção 9 passando; checklist de segurança da seção 6 conferido item a item no resumo.

---

## 12. Entregáveis em todo fim de fase

1. Lista de arquivos criados/alterados.
2. Saída de `typecheck`, `lint` e testes.
3. Decisões tomadas sem instrução explícita e por quê.
4. Riscos e limitações conhecidos.
5. Instruções exatas para eu testar manualmente o que foi feito (inclusive no celular, a partir da Fase 5).
