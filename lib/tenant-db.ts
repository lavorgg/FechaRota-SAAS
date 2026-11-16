// Acesso ao banco isolado por empresa (seção 3.4).
//
// getTenantDb(session) devolve um client Prisma que:
// - injeta companyId em todo `where` de leitura, update e delete;
// - injeta companyId em todo `data` de create;
// - recusa trocar o companyId de um registro;
// - recusa connect/connectOrCreate/set de relações dentro de `data` (ver assertNoRelationRepointing);
// - recusa SQL cru e modelos que não pertencem a uma empresa (ex.: Session).
//
// Segunda barreira, no próprio banco: as relações entre tabelas de negócio usam chave
// estrangeira composta (companyId + id). Mesmo um bug aqui não consegue ligar um pedido
// a um cliente de outra empresa: o Postgres rejeita.

import { prisma } from "./db";
import { TenantIsolationError, type TenantContext, scopeArgsToCompany } from "./tenant-scope";

export { TenantIsolationError, type TenantContext } from "./tenant-scope";

function createTenantDb(companyId: string) {
  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allOperations({ model, operation, args, query }) {
        return query(scopeArgsToCompany(model, operation, args, companyId));
      },
    },
  });
}

/** Client Prisma já filtrado pela empresa da sessão. */
export type TenantDb = ReturnType<typeof createTenantDb>;

/** O mesmo client, dentro de uma transação interativa (`db.$transaction(async (tx) => ...)`). */
export type TenantTx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

/**
 * Único jeito de acessar o banco a partir de páginas, Server Actions e Route Handlers.
 * `session` vem da verificação de sessão no servidor, nunca de dados enviados pelo navegador.
 */
export function getTenantDb(session: TenantContext): TenantDb {
  if (typeof session.companyId !== "string" || session.companyId.trim() === "") {
    throw new TenantIsolationError("getTenantDb exige uma sessão com companyId.");
  }
  return createTenantDb(session.companyId);
}
