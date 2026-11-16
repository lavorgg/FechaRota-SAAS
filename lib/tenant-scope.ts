// Regras de isolamento por empresa aplicadas aos argumentos de cada operação do Prisma
// (seção 3.4). Módulo puro, sem banco, para ser testado exaustivamente.
// O client que usa estas regras está em lib/tenant-db.ts.


/** O mínimo que o client por empresa precisa saber da sessão. */
export type TenantContext = {
  companyId: string;
};

/** Modelos de negócio: todos têm a coluna companyId. Conferido contra o schema por teste. */
export const TENANT_MODELS = [
  "User",
  "CompanyCounter",
  "Vehicle",
  "Customer",
  "Product",
  "RecurringOrderTemplate",
  "RecurringOrderTemplateItem",
  "Order",
  "OrderItem",
  "Route",
  "DeliveryProof",
  "ContainerMovement",
  "FileObject",
  "AuditLog",
] as const;

/** A própria empresa: acessível só pelo próprio id, e só para ler e atualizar. */
export const COMPANY_MODEL = "Company";

/** Modelos sem companyId: inacessíveis pelo client por empresa. */
export const FORBIDDEN_MODELS = ["Session"] as const;

const tenantModelSet: ReadonlySet<string> = new Set(TENANT_MODELS);

const UNIQUE_WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
  "upsert",
]);

const FILTER_WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

const CREATE_OPERATIONS: ReadonlySet<string> = new Set(["create", "createMany", "createManyAndReturn"]);

const COMPANY_ALLOWED_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "update",
]);

/**
 * Erro de programação: o código tentou algo que quebraria o isolamento entre empresas.
 * Nunca é mostrado ao usuário final (vira "erro inesperado" na borda).
 */
export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArgs(args: unknown): AnyRecord {
  return isRecord(args) ? { ...args } : {};
}

/** Campos Json livres (AuditLog.before/after): o conteúdo deles não é inspecionado. */
const JSON_PAYLOAD_KEYS: ReadonlySet<string> = new Set(["before", "after"]);

/**
 * Recusa `connect`, `connectOrCreate` e `set` de relação em qualquer nível de `data`.
 *
 * Motivo: as relações usam chave composta (companyId + id). Um `connect: { id }` faz o Prisma
 * copiar o companyId DO REGISTRO CONECTADO, então conectar um id de outra empresa moveria o
 * registro (ou o filho) de empresa. Com chave escalar (`customerId: "..."`) isso não acontece:
 * o companyId é o da sessão e o banco rejeita o par se o id for de outra empresa.
 */
function assertNoRelationRepointing(value: unknown, model: string): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoRelationRepointing(entry, model);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (JSON_PAYLOAD_KEYS.has(key)) continue;
    if (key === "connect" || key === "connectOrCreate") {
      throw new TenantIsolationError(
        `Não use "${key}" em ${model}: informe a chave estrangeira diretamente (ex.: customerId).`,
      );
    }
    if (key === "set" && (isRecord(nested) || (Array.isArray(nested) && nested.some(isRecord)))) {
      throw new TenantIsolationError(`Não use "set" de relação em ${model}: atualize os registros filhos diretamente.`);
    }
    assertNoRelationRepointing(nested, model);
  }
}

/** Garante que `data` não tenta gravar em outra empresa nem usar a relação `company`. */
function withCompanyInCreateData(data: unknown, companyId: string, model: string): AnyRecord {
  if (!isRecord(data)) {
    throw new TenantIsolationError(`create em ${model} sem "data".`);
  }
  if ("company" in data) {
    throw new TenantIsolationError(`Não use a relação "company" em ${model}: o companyId é injetado automaticamente.`);
  }
  if (data.companyId !== undefined && data.companyId !== companyId) {
    throw new TenantIsolationError(`Tentativa de criar ${model} em outra empresa.`);
  }
  assertNoRelationRepointing(data, model);
  return { ...data, companyId };
}

/** Garante que um update não muda o registro de empresa. */
function withoutCompanyInUpdateData(data: unknown, companyId: string, model: string): unknown {
  if (Array.isArray(data)) {
    return data.map((entry) => withoutCompanyInUpdateData(entry, companyId, model));
  }
  if (!isRecord(data)) return data;
  if ("company" in data) {
    throw new TenantIsolationError(`Não é permitido alterar a empresa de ${model}.`);
  }
  assertNoRelationRepointing(data, model);
  if (data.companyId === undefined) return data;
  if (data.companyId !== companyId) {
    throw new TenantIsolationError(`Não é permitido mover ${model} para outra empresa.`);
  }
  const { companyId: _same, ...rest } = data;
  void _same;
  return rest;
}

function scopeTenantArgs(model: string, operation: string, rawArgs: unknown, companyId: string): AnyRecord {
  const args = asArgs(rawArgs);

  if (UNIQUE_WHERE_OPERATIONS.has(operation)) {
    if (!isRecord(args.where)) {
      throw new TenantIsolationError(`${operation} em ${model} sem "where".`);
    }
    // Campo extra em where único: se o registro for de outra empresa, o Prisma não o encontra.
    args.where = { ...args.where, companyId };
  } else if (FILTER_WHERE_OPERATIONS.has(operation)) {
    args.where = isRecord(args.where) ? { AND: [args.where, { companyId }] } : { companyId };
  } else if (!CREATE_OPERATIONS.has(operation)) {
    throw new TenantIsolationError(`Operação "${operation}" não é permitida em ${model} pelo client por empresa.`);
  }

  if (operation === "create") {
    args.data = withCompanyInCreateData(args.data, companyId, model);
  } else if (operation === "createMany" || operation === "createManyAndReturn") {
    args.data = Array.isArray(args.data)
      ? args.data.map((entry) => withCompanyInCreateData(entry, companyId, model))
      : withCompanyInCreateData(args.data, companyId, model);
  } else if (operation === "upsert") {
    args.create = withCompanyInCreateData(args.create, companyId, model);
    args.update = withoutCompanyInUpdateData(args.update, companyId, model);
  } else if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") {
    args.data = withoutCompanyInUpdateData(args.data, companyId, model);
  }

  return args;
}

function scopeCompanyArgs(operation: string, rawArgs: unknown, companyId: string): AnyRecord {
  if (!COMPANY_ALLOWED_OPERATIONS.has(operation)) {
    throw new TenantIsolationError(`Operação "${operation}" não é permitida em Company pelo client por empresa.`);
  }
  const args = asArgs(rawArgs);
  if (UNIQUE_WHERE_OPERATIONS.has(operation)) {
    if (!isRecord(args.where)) {
      throw new TenantIsolationError(`${operation} em Company sem "where".`);
    }
    args.where = { ...args.where, id: companyId };
  } else {
    args.where = isRecord(args.where) ? { AND: [args.where, { id: companyId }] } : { id: companyId };
  }
  if (operation === "update") {
    if (isRecord(args.data) && "id" in args.data) {
      throw new TenantIsolationError("Não é permitido alterar o id da empresa.");
    }
    assertNoRelationRepointing(args.data, COMPANY_MODEL);
  }
  return args;
}

/** Aplica o filtro de empresa aos argumentos de uma operação. Exportada para teste unitário. */
export function scopeArgsToCompany(
  model: string | undefined,
  operation: string,
  args: unknown,
  companyId: string,
): AnyRecord {
  if (model === undefined) {
    throw new TenantIsolationError(`SQL cru ("${operation}") não é permitido pelo client por empresa.`);
  }
  if (model === COMPANY_MODEL) {
    return scopeCompanyArgs(operation, args, companyId);
  }
  if (tenantModelSet.has(model)) {
    return scopeTenantArgs(model, operation, args, companyId);
  }
  throw new TenantIsolationError(`O modelo ${model} não é acessível pelo client por empresa.`);
}
