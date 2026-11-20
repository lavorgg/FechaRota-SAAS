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
| Reagendar | Cria pedido novo ligado ao original (`rescheduledFromOrderId`, único); o original fica `NAO_ENTREGUE`, que passa a ser final | **Decidido pelo dono do produto** (comprovante é um por pedido) |
| Gerador com produto inativo | Template ignorado inteiro, com o motivo | **Decidido pelo dono do produto** |
| CSV com SKU ou CPF/CNPJ repetido | Linha recusada; nada existente é alterado | **Decidido pelo dono do produto** |
| Tela de templates | Dentro do cliente: criar, editar itens, pausar até uma data, desativar | **Decidido pelo dono do produto** |
| CPF/CNPJ | Único por empresa também no cadastro manual | Mesma regra da importação |
| Busca sem acento | Coluna `searchText` normalizada, mantida pelo app; busca exige todos os pedaços digitados | Sem extensão do Postgres; funciona igual no Neon e no Supabase |
| Catálogo no lançamento rápido | Produtos ativos vão para o navegador; a busca de produto é local | Resposta imediata ao digitar; preço é recalculado no servidor |
| Mudar data de pedido de recorrente | Proibido: cancelar e lançar avulso | Mover a data faria o gerador criar outro pedido na data original |
| Editar pedido pendente | A cópia do endereço é atualizada com o cadastro atual | Pedido ainda não foi carregado; o romaneio sai com o endereço corrigido |
| Segundo pedido no dia | Permitido com confirmação (código `CONFIRMACAO` na action) | Seção 5.5 |
| Gerador concorrente | Trava a linha do contador de pedidos no início da transação | Dois geradores ao mesmo tempo passam um de cada vez |
| Rótulo do filtro de bairro | Grafia mais usada; no empate, a com inicial maiúscula e acento | Agrupa pela chave normalizada (seção 4) |
| Busca de CEP | No navegador, direto no ViaCEP | Na Fase 6, a CSP precisa liberar `connect-src https://viacep.com.br` |
| Volumes no agrupador | Quantidade de itens (linhas) dos pedidos | **Decidido pelo dono do produto** |
| Partida do Google Maps | Endereço do depósito (`Company.depot*`), editado em `/app/empresa`; sem ele, o Maps parte do aparelho | **Decidido pelo dono do produto** |
| Excluir rota | Só em rascunho; pedidos voltam para "sem rota"; código não reaproveitado; auditado | **Decidido pelo dono do produto** |
| Motivo ao reabrir rota | Opcional, gravado na auditoria | **Decidido pelo dono do produto** |
| Paradas por link do Maps | 9 waypoints (10 paradas por trecho); cada trecho começa na última parada do anterior | Documentação do Google inacessível daqui: **valor não verificado**. Se um link abrir cortado, reduzir `MAPS_MAX_WAYPOINTS` |
| Coordenadas no Maps | Do cadastro atual do cliente, só se o endereço do cadastro ainda bate com o do pedido | O pedido não guarda coordenadas |
| Rota liberada | Nome, motorista e veículo também congelam | Seção 5.6: "congela a rota" |
| Liberar | Exige ao menos 1 parada, motorista e veículo ativos; renumera as paradas 1..n | A numeração impressa não pode ter buraco |
| Romaneio de carga | Nome e unidade do snapshot do pedido; SKU, peso e vasilhame do cadastro atual | `OrderItem` não guarda SKU, peso nem vasilhame |
| Saldo de vasilhames no romaneio | Anterior à rota: movimentos da própria rota ficam de fora | Reimpressão depois das entregas mostra o mesmo saldo |
| Boleto no romaneio | "BOLETO — não cobrar", como o "FATURADO — não cobrar" da especificação | Boleto também não é cobrado na entrega |
| Observações do pedido | Saem no romaneio de entrega | Instruções de entrega ficam no pedido |
| Impressão | Páginas dentro do painel; `@media print` esconde menu, topo e avisos | Prévia na tela e "Imprimir" no mesmo lugar |
| Log de Server Actions no `next dev` | Desligado (`logging.serverFunctions: false`) | O Next 16 imprimia os argumentos, inclusive a senha do login |
| Valor a cobrar na entrega parcial | O recalculado (itens entregues) substitui `amountToCollectCents` do pedido; o pedido original fica nos itens e na auditoria | **Decidido pelo dono do produto** |
| ADMIN em `/motorista` | Vê todas as rotas do dia e pode iniciar e finalizar entregas de qualquer uma | **Decidido pelo dono do produto** |
| Rota em rascunho | Não aparece para o motorista | **Decidido pelo dono do produto** |
| Plano em atraso | O motorista inicia rota já liberada e finaliza entregas normalmente | **Decidido pelo dono do produto** |
| Página `/motorista` | Sem dado do usuário no HTML; o app busca na API ou lê do IndexedDB; navegação interna pelo `#` | O service worker guarda a página para abrir offline sem guardar dado de negócio (seção 3.13) |
| Cache da página do motorista | Rede primeiro (4 s); guarda junto os arquivos `/_next/static` que ela cita; na instalação já baixa a página | Página e JS da mesma versão; o primeiro uso offline funciona |
| IndexedDB | Um banco por usuário (`fecharota-motorista-{id}`); `localStorage` guarda só id, nome e empresa do último usuário | Celular compartilhado; abrir sem sinal |
| Endpoints do motorista | Route Handlers `/api/motorista/*`; 401 pausa a fila; 408, 429, 5xx e rede são temporários; demais 4xx vão para "Precisa de atenção"; código `ARQUIVO` sobe os arquivos de novo | A fila precisa separar erro temporário de definitivo |
| Rate limit do motorista | 120 requisições por minuto por usuário | Descarregar a fila de um dia sem sinal de uma vez |
| Nome do recebedor | Obrigatório em entregue e parcial | "Nome do recebedor (documento opcional)" na seção 5.7 |
| Pagamento após a entrega | Boleto e faturado: FATURADO; não entregue: NAO_RECEBIDO; com Pix: PIX_A_CONFERIR; só dinheiro: RECEBIDO; nada: NAO_RECEBIDO | A seção 5.8 só conta Pix depois da conferência |
| Não entregue | Valor a cobrar do pedido não muda; quantidade entregue 0 | O fechamento só soma o que foi entregue |
| Horário da entrega | O do celular, limitado ao horário do servidor | Relógio adiantado não grava entrega no futuro |
| Um motorista, uma rota em andamento | "Iniciar" trava a linha do motorista na transação | Dois inícios simultâneos passam um de cada vez |
| "Precisa de atenção" | "Tentar de novo" e "Descartar" (com confirmação; a parada volta a abrir no celular) | Nada é descartado sem o motorista pedir |
| Logout do motorista | Bloqueado com entrega pendente ou em atenção, e sem conexão | Evita perder entrega e sessão aberta no servidor |
| Assinatura | Recusa traço com menos de 80 px de tinta ou menor que 24 px | "Rejeitar assinatura vazia ou com traço insignificante" sem número na especificação |
| Foto acima de 400 KB | Baixa a qualidade até 0,45 e depois reduz o lado em 20% (mínimo 640 px) | Meta de 400 KB da seção 5.7 |
| Lighthouse PWA | Instalabilidade conferida no E2E pelo Chrome (`Page.getInstallabilityErrors`); só "in-incognito" é aceito | O Lighthouse 12 removeu a categoria PWA; todo contexto do Playwright é anônimo |
| CORS do storage local | `db:reset` libera as portas 3000 e 3100 | Upload direto do navegador; o CORS do R2 é da Fase 6 |
| Sobra/falta no acerto | Dinheiro entregue no caixa − (esperado − Pix registrado pelo motorista) | **Decidido pelo dono do produto** |
| Pix não conferido ao concluir o acerto | A rota conclui e o Pix continua "a conferir"; a confirmação segue disponível no fechamento da rota concluída | **Decidido pelo dono do produto** |
| Correção de entrega finalizada | Só valores recebidos (dinheiro e Pix) de uma parada, na tela de acerto, por ADMIN, com motivo e auditoria; desfecho e quantidades não mudam | **Decidido pelo dono do produto** |
| Auditoria | Tela de consulta só para ADMIN, com filtro por período e tipo de evento | **Decidido pelo dono do produto** |
| Permissão `auditoria.consultar` | Nova, só ADMIN, com o teste da matriz | A tabela da 5.1 não tem a linha; segue a decisão acima |
| Fechamento | Abre a partir de "Em andamento" (com aviso); concluir só em "Aguardando acerto" | A máquina de estados só permite AGUARDANDO_ACERTO → CONCLUIDA |
| Desmarcar Pix e corrigir valores | Só antes de concluir o acerto; corrigir recalcula o pagamento (Pix volta a "a conferir") | Depois de concluído, os números gravados não mudam; só a confirmação tardia de Pix |
| Vasilhames no acerto | Voltam ao depósito = saíram − deixados + recolhidos; saldo com clientes = deixados − recolhidos | "Saldo da rota" sem fórmula na seção 5.8 |
| Comprovantes no acerto | URLs de 5 minutos pedidas ao abrir o comprovante, não ao abrir a página | A página pode ficar aberta mais que 5 minutos |
| Documento do recebedor | Mascarado na tela (só os 2 últimos caracteres) | Seção 6: dado pessoal |
| Resumo do acerto | Imprime também antes de concluir, marcado "PRÉVIA" | Conferência antes de fechar |
| Retenção | Lote de 500 arquivos por empresa por rodada; `PENDING` com mais de 24 h sai do banco; cron 06:00 UTC | Cabe no tempo da função; o resto vai na rodada seguinte |
| CSP | Nonce novo por página no `proxy.ts`; `style-src 'unsafe-inline'`; `worker-src 'self'`; `upgrade-insecure-requests` só no deploy; 404 renderizada a cada requisição | React, Radix e Sonner usam estilo inline; com `strict-dynamic` o SW precisa de `worker-src`; o storage local é http |
| Zod | `z.config({ jitless: true })` em `lib/validation/common.ts` | O teste de `new Function` do Zod gera violação de CSP |
| Outros cabeçalhos | `X-Frame-Options: DENY`, `Permissions-Policy` (câmera e localização só do site), HSTS só no deploy | Seção 6 |
| CORS do R2 | `pnpm storage:cors` por bucket, só origens https, PUT e GET | Seção 5.7 ("Bucket R2") |

## Perguntas em aberto para o dono do produto

1. **Configurações da empresa.** A Fase 4 criou `/app/empresa` com nome, CNPJ, telefone e endereço do depósito. Fuso, política de comprovante e retenção de arquivos continuam sem tela. Em qual fase entram?

## Situação

- **Fase 1:** código, testes e build prontos. Pendente: o deploy de preview (ver Fase 6).
- **Fase 2:** pronta.
- **Fase 3:** pronta.
- **Fase 4:** pronta. PDFs dos romaneios gerados pelo E2E em `test-results/`.
- **Fase 5:** pronta. Teste em iPhone e Android reais depende do deploy de preview (checklist no README).
- **Fase 6:** código, testes e README de deploy prontos. Pendente: deploys de preview e de produção, que exigem as contas (Vercel Pro, Neon/Supabase, R2, Upstash) e um domínio.
