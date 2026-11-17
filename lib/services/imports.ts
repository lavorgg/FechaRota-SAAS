// Importação de produtos e clientes por CSV (seção 5.4), em lotes de até 200 linhas.
//
// Linha com SKU ou CPF/CNPJ já cadastrado (ou repetido no próprio arquivo) é REJEITADA e vai
// para o relatório; nada existente é alterado (decisão do dono do produto).

import "server-only";

import { normalizeKey } from "../../domain/normalize";
import { milliToDecimalString } from "../../domain/quantity";
import { customerSearchText, productSearchText } from "../../domain/search";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { ServiceError, prismaErrorCode } from "../errors";
import { getTenantDb } from "../tenant-db";
import {
  type CustomerImportRow,
  type ImportBatch,
  type ImportBatchResult,
  type ProductImportRow,
  customerImportRowSchema,
  productImportRowSchema,
  validateImportRow,
} from "../validation/import";

function concurrencyGuard(error: unknown): never {
  if (prismaErrorCode(error) === "P2002") {
    throw new ServiceError("CONFLITO", "Outra pessoa cadastrou o mesmo SKU ou CPF/CNPJ enquanto o arquivo era importado. Importe o arquivo de novo: as linhas já criadas serão recusadas como repetidas.");
  }
  throw error;
}

export async function importProducts(ctx: ServiceContext, batch: ImportBatch): Promise<ImportBatchResult> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const errors: ImportBatchResult["errors"] = [];

  const valid: Array<{ line: number; data: ProductImportRow }> = [];
  const seen = new Set<string>();
  for (const row of batch.rows) {
    const result = validateImportRow(productImportRowSchema, row.values);
    if (!result.ok) {
      errors.push({ line: row.line, error: result.error });
    } else if (seen.has(result.data.sku)) {
      errors.push({ line: row.line, error: `sku: ${result.data.sku} repetido no arquivo.` });
    } else {
      seen.add(result.data.sku);
      valid.push({ line: row.line, data: result.data });
    }
  }

  const existing = new Set(
    (await db.product.findMany({ where: { sku: { in: valid.map((row) => row.data.sku) } }, select: { sku: true } })).map((p) => p.sku),
  );
  const fresh = valid.filter((row) => {
    if (!existing.has(row.data.sku)) return true;
    errors.push({ line: row.line, error: `sku: ${row.data.sku} já cadastrado.` });
    return false;
  });

  // Vasilhames: os cadastrados (retornáveis e ativos) ou os retornáveis deste mesmo lote.
  const containerSkus = [...new Set(fresh.flatMap((row) => (row.data.sku_vasilhame ? [row.data.sku_vasilhame] : [])))];
  const containersInDb = new Map(
    (
      await db.product.findMany({ where: { sku: { in: containerSkus }, isReturnableContainer: true, active: true }, select: { id: true, sku: true } })
    ).map((p) => [p.sku, p.id]),
  );
  const containersInBatch = new Set(fresh.filter((row) => row.data.retornavel).map((row) => row.data.sku));
  const ready = fresh.filter((row) => {
    const sku = row.data.sku_vasilhame;
    if (!sku || containersInDb.has(sku) || containersInBatch.has(sku)) return true;
    errors.push({ line: row.line, error: `sku_vasilhame: ${sku} não é um vasilhame retornável cadastrado.` });
    return false;
  });

  const record = (data: ProductImportRow, containerProductId: string | null) => ({
    companyId: ctx.companyId,
    sku: data.sku,
    name: data.nome,
    unit: data.unidade,
    priceCents: data.preco,
    weightKg: data.peso_kg === null ? null : milliToDecimalString(data.peso_kg),
    isReturnableContainer: data.retornavel,
    containerProductId,
    unitsPerContainer: containerProductId ? data.unidades_por_vasilhame : null,
    searchText: productSearchText({ sku: data.sku, name: data.nome }),
  });

  try {
    await db.$transaction(async (tx) => {
      const containers = ready.filter((row) => row.data.retornavel);
      const created = await tx.product.createManyAndReturn({ data: containers.map((row) => record(row.data, null)), select: { id: true, sku: true } });
      const containerIds = new Map([...containersInDb, ...created.map((p) => [p.sku, p.id] as const)]);
      const others = ready.filter((row) => !row.data.retornavel);
      await tx.product.createMany({
        data: others.map((row) => record(row.data, row.data.sku_vasilhame ? (containerIds.get(row.data.sku_vasilhame) ?? null) : null)),
      });
      await tx.auditLog.create({
        data: { companyId: ctx.companyId, userId: ctx.userId, entity: "Product", entityId: "importacao", action: "PRODUTOS_IMPORTADOS", after: { created: ready.length, errors: errors.length } },
      });
    });
  } catch (error) {
    concurrencyGuard(error);
  }
  return { created: ready.length, errors: errors.sort((a, b) => a.line - b.line) };
}

export async function importCustomers(ctx: ServiceContext, batch: ImportBatch): Promise<ImportBatchResult> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const errors: ImportBatchResult["errors"] = [];

  const valid: Array<{ line: number; data: CustomerImportRow }> = [];
  const seen = new Set<string>();
  for (const row of batch.rows) {
    const result = validateImportRow(customerImportRowSchema, row.values);
    if (!result.ok) {
      errors.push({ line: row.line, error: result.error });
    } else if (result.data.documento && seen.has(result.data.documento)) {
      errors.push({ line: row.line, error: "documento: CPF/CNPJ repetido no arquivo." });
    } else {
      if (result.data.documento) seen.add(result.data.documento);
      valid.push({ line: row.line, data: result.data });
    }
  }

  const documents = valid.flatMap((row) => (row.data.documento ? [row.data.documento] : []));
  const existing = new Set(
    (await db.customer.findMany({ where: { document: { in: documents } }, select: { document: true } })).flatMap((c) => (c.document ? [c.document] : [])),
  );
  const ready = valid.filter((row) => {
    if (!row.data.documento || !existing.has(row.data.documento)) return true;
    errors.push({ line: row.line, error: "documento: CPF/CNPJ já cadastrado." });
    return false;
  });

  try {
    await db.$transaction(async (tx) => {
      await tx.customer.createMany({
        data: ready.map(({ data }) => ({
          companyId: ctx.companyId,
          name: data.nome,
          legalName: data.razao_social,
          document: data.documento,
          phone: data.telefone,
          zipCode: data.cep,
          street: data.rua,
          number: data.numero,
          complement: data.complemento,
          neighborhood: data.bairro,
          city: data.cidade,
          state: data.uf,
          referencePoint: data.ponto_referencia,
          defaultPaymentMethod: data.forma_pagamento,
          deliveryWindow: data.janela_entrega,
          notes: data.observacoes,
          neighborhoodKey: normalizeKey(data.bairro),
          cityKey: normalizeKey(data.cidade),
          searchText: customerSearchText({ name: data.nome, legalName: data.razao_social, neighborhood: data.bairro, city: data.cidade, document: data.documento, phone: data.telefone }),
        })),
      });
      await tx.auditLog.create({
        data: { companyId: ctx.companyId, userId: ctx.userId, entity: "Customer", entityId: "importacao", action: "CLIENTES_IMPORTADOS", after: { created: ready.length, errors: errors.length } },
      });
    });
  } catch (error) {
    concurrencyGuard(error);
  }
  return { created: ready.length, errors: errors.sort((a, b) => a.line - b.line) };
}
