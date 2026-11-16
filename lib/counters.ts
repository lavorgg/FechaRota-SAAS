// Numeração sequencial por empresa (seção 3.6): orderNumber e Route.code.
// Sempre dentro da MESMA transação que cria o registro. Nunca max()+1.

import type { TenantDb, TenantTx } from "./tenant-db";

export const COUNTER_KEYS = {
  order: "order",
  route: "route",
} as const;
export type CounterKey = (typeof COUNTER_KEYS)[keyof typeof COUNTER_KEYS];

function isRecordNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025";
}

/**
 * Devolve o próximo número da sequência.
 *
 * O UPDATE com `increment` trava a linha do contador até o fim da transação: duas
 * transações simultâneas recebem números diferentes, e se a transação falhar o número
 * volta (não fica buraco por erro de validação).
 */
export async function nextCounterValue(tx: TenantDb | TenantTx, companyId: string, key: CounterKey): Promise<number> {
  const where = { companyId_key: { companyId, key } };
  const data = { value: { increment: 1 } };
  try {
    const counter = await tx.companyCounter.update({ where, data, select: { value: true } });
    return counter.value;
  } catch (error) {
    if (!isRecordNotFound(error)) throw error;
  }
  // Primeiro uso da sequência nesta empresa. `skipDuplicates` (ON CONFLICT DO NOTHING) torna a
  // criação segura mesmo com duas transações chegando aqui ao mesmo tempo.
  await tx.companyCounter.createMany({ data: [{ companyId, key, value: 0 }], skipDuplicates: true });
  const counter = await tx.companyCounter.update({ where, data, select: { value: true } });
  return counter.value;
}

/** Código de rota exibido ao usuário: 12 -> "R-0012". */
export function formatRouteCode(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error("Sequência de rota inválida.");
  }
  return `R-${String(sequence).padStart(4, "0")}`;
}
