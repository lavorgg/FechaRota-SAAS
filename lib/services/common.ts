// Peças comuns aos serviços de cadastro e pedidos.

import "server-only";

import { searchTokens } from "../../domain/search";
import { MESSAGES, ServiceError, prismaErrorCode } from "../errors";

export const PAGE_SIZE = 20;

export type Page<T> = { items: T[]; total: number; page: number; pageCount: number };

export function pageBounds(total: number, requested: number, size = PAGE_SIZE): { page: number; pageCount: number; skip: number } {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, requested), pageCount);
  return { page, pageCount, skip: (page - 1) * size };
}

/** Filtro "todos os pedaços da busca aparecem no texto normalizado". Lista vazia = sem filtro. */
export function searchWhere(query: string | undefined): { AND: Array<{ searchText: { contains: string } }> } {
  return { AND: searchTokens(query ?? "").map((token) => ({ searchText: { contains: token } })) };
}

export function activeWhere(status: "ativos" | "inativos" | "todos"): { active?: boolean } {
  if (status === "ativos") return { active: true };
  if (status === "inativos") return { active: false };
  return {};
}

/** Exclusão barrada por chave estrangeira (pedidos, rotas, templates...) vira mensagem clara. */
export function rethrowDeleteError(error: unknown): never {
  if (prismaErrorCode(error) === "P2003") throw new ServiceError("CONFLITO", MESSAGES.linkedRecords);
  throw error;
}

/** Unicidade violada vira erro no campo certo. */
export function rethrowUnique(error: unknown, field: string, message: string): never {
  if (prismaErrorCode(error) === "P2002") throw new ServiceError("CONFLITO", message, { [field]: message });
  throw error;
}
