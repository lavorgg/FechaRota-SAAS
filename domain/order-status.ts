// Máquina de estados do pedido (seção 3.8). Módulo puro: não acessa banco nem sessão.
// Quem pode disparar cada transição (papel) é decidido em lib/auth/permissions.ts.

export const ORDER_STATUSES = [
  "PENDENTE",
  "EM_ROTA",
  "ENTREGUE",
  "ENTREGUE_PARCIAL",
  "NAO_ENTREGUE",
  "CANCELADO",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Transições permitidas. Qualquer par fora desta tabela é rejeitado.
 *
 * - PENDENTE -> EM_ROTA: a rota do pedido foi liberada para carga.
 * - PENDENTE -> CANCELADO: cancelamento com motivo.
 * - EM_ROTA -> ENTREGUE | ENTREGUE_PARCIAL | NAO_ENTREGUE: desfecho registrado pelo motorista.
 * - EM_ROTA -> PENDENTE: somente quando a rota volta para RASCUNHO (com auditoria).
 * - NAO_ENTREGUE -> PENDENTE: reagendamento para outra data.
 * - ENTREGUE, ENTREGUE_PARCIAL e CANCELADO são finais.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDENTE: ["EM_ROTA", "CANCELADO"],
  EM_ROTA: ["ENTREGUE", "ENTREGUE_PARCIAL", "NAO_ENTREGUE", "PENDENTE"],
  ENTREGUE: [],
  ENTREGUE_PARCIAL: [],
  NAO_ENTREGUE: ["PENDENTE"],
  CANCELADO: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Estados finais: correção posterior só por ADMIN, com motivo e auditoria. */
export function isFinalOrderStatus(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

/** Só pedido PENDENTE pode ser editado ou entrar/sair de uma rota em rascunho. */
export function isOrderEditable(status: OrderStatus): boolean {
  return status === "PENDENTE";
}

export class InvalidOrderTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Não é possível mudar o pedido de ${ORDER_STATUS_LABELS[from]} para ${ORDER_STATUS_LABELS[to]}.`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  PENDENTE: "Pendente",
  EM_ROTA: "Em rota",
  ENTREGUE: "Entregue",
  ENTREGUE_PARCIAL: "Entregue parcialmente",
  NAO_ENTREGUE: "Não entregue",
  CANCELADO: "Cancelado",
};
