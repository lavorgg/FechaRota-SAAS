// Clientes (seção 5.4). Bairro e cidade guardam o nome original e a chave normalizada,
// usada para agrupar; o texto de busca é normalizado sem acento.

import "server-only";

import { normalizeKey } from "../../domain/normalize";
import type { PaymentMethod } from "../../domain/payment";
import { customerSearchText } from "../../domain/search";
import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { notFound } from "../errors";
import { getTenantDb } from "../tenant-db";
import type { CustomerData, ListQuery, UpdateCustomerData } from "../validation/catalog";
import { type Page, activeWhere, pageBounds, rethrowDeleteError, rethrowUnique, searchWhere } from "./common";

export const DOCUMENT_IN_USE = "Já existe um cliente com este CPF/CNPJ.";

export type CustomerListItemDTO = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  phone: string | null;
  document: string | null;
  defaultPaymentMethod: PaymentMethod;
  active: boolean;
};

export type CustomerDTO = CustomerListItemDTO & {
  legalName: string | null;
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  state: string;
  referencePoint: string | null;
  latitude: number | null;
  longitude: number | null;
  deliveryWindow: string | null;
  notes: string | null;
};

const listSelect = { id: true, name: true, neighborhood: true, city: true, phone: true, document: true, defaultPaymentMethod: true, active: true } as const;
const detailSelect = {
  ...listSelect,
  legalName: true,
  zipCode: true,
  street: true,
  number: true,
  complement: true,
  state: true,
  referencePoint: true,
  latitude: true,
  longitude: true,
  deliveryWindow: true,
  notes: true,
} as const;

/** Campos gravados a partir do formulário, com as chaves e o texto de busca recalculados. */
export function customerRecord(data: CustomerData) {
  return {
    name: data.name,
    legalName: data.legalName,
    document: data.document,
    phone: data.phone,
    zipCode: data.zipCode,
    street: data.street,
    number: data.number,
    complement: data.complement,
    neighborhood: data.neighborhood,
    city: data.city,
    state: data.state,
    referencePoint: data.referencePoint,
    latitude: data.latitude,
    longitude: data.longitude,
    defaultPaymentMethod: data.defaultPaymentMethod,
    deliveryWindow: data.deliveryWindow,
    notes: data.notes,
    neighborhoodKey: normalizeKey(data.neighborhood),
    cityKey: normalizeKey(data.city),
    searchText: customerSearchText(data),
  };
}

export async function listCustomers(ctx: ServiceContext, query: ListQuery): Promise<Page<CustomerListItemDTO>> {
  assertCan(ctx, "cadastros.gerenciar");
  const db = getTenantDb(ctx);
  const where = { ...activeWhere(query.status), ...searchWhere(query.q) };
  const total = await db.customer.count({ where });
  const { page, pageCount, skip } = pageBounds(total, query.page);
  const items = await db.customer.findMany({ where, select: listSelect, orderBy: [{ active: "desc" }, { name: "asc" }], skip, take: 20 });
  return { items, total, page, pageCount };
}

export async function getCustomer(ctx: ServiceContext, id: string): Promise<CustomerDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  const customer = await getTenantDb(ctx).customer.findUnique({ where: { id }, select: detailSelect });
  if (!customer) throw notFound();
  return customer;
}

export async function createCustomer(ctx: ServiceContext, data: CustomerData): Promise<CustomerDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  try {
    return await getTenantDb(ctx).customer.create({ data: { companyId: ctx.companyId, ...customerRecord(data) }, select: detailSelect });
  } catch (error) {
    rethrowUnique(error, "document", DOCUMENT_IN_USE);
  }
}

/** Mudar o cadastro não altera pedidos já lançados: eles guardam a cópia do endereço (seção 3.7). */
export async function updateCustomer(ctx: ServiceContext, data: UpdateCustomerData): Promise<CustomerDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const { id, ...fields } = data;
  if (!(await db.customer.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  try {
    return await db.customer.update({ where: { id }, data: customerRecord(fields), select: detailSelect });
  } catch (error) {
    rethrowUnique(error, "document", DOCUMENT_IN_USE);
  }
}

export async function setCustomerActive(ctx: ServiceContext, id: string, active: boolean): Promise<CustomerDTO> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.customer.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  return db.customer.update({ where: { id }, data: { active }, select: detailSelect });
}

export async function deleteCustomer(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx, "cadastros.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  if (!(await db.customer.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
  try {
    await db.customer.delete({ where: { id } });
  } catch (error) {
    rethrowDeleteError(error);
  }
}
