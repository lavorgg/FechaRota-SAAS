// Saldo de vasilhames por cliente (seção 4, ContainerMovement): entregues − devolvidos.
// Usado no romaneio de entrega e no pacote da rota do motorista.

import "server-only";

import type { TenantDb } from "../tenant-db";

export type ContainerBalanceLine = { productId: string; sku: string; name: string; balance: number };

/**
 * Saldo de cada cliente, sem os movimentos dos pedidos informados em `excludeOrderIds`
 * (os da própria rota): reimprimir ou baixar de novo depois das entregas mostra o mesmo
 * saldo anterior. Só tipos com saldo diferente de zero.
 */
export async function containerBalances(db: TenantDb, customerIds: ReadonlyArray<string>, excludeOrderIds: ReadonlyArray<string>): Promise<Map<string, ContainerBalanceLine[]>> {
  const result = new Map<string, ContainerBalanceLine[]>();
  if (customerIds.length === 0) return result;
  const [movements, containers] = await Promise.all([
    db.containerMovement.groupBy({
      by: ["customerId", "containerProductId"],
      where: { customerId: { in: [...customerIds] }, OR: [{ orderId: null }, { orderId: { notIn: [...excludeOrderIds] } }] },
      _sum: { delivered: true, returned: true },
    }),
    db.product.findMany({ where: { isReturnableContainer: true }, select: { id: true, sku: true, name: true } }),
  ]);
  const containerById = new Map(containers.map((container) => [container.id, container]));
  for (const movement of movements) {
    const balance = (movement._sum.delivered ?? 0) - (movement._sum.returned ?? 0);
    const container = containerById.get(movement.containerProductId);
    if (balance === 0 || !container) continue;
    const list = result.get(movement.customerId) ?? [];
    list.push({ productId: container.id, sku: container.sku, name: container.name, balance });
    result.set(movement.customerId, list);
  }
  for (const list of result.values()) list.sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR"));
  return result;
}
