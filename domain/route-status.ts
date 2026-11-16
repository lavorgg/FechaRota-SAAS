// Máquina de estados da rota (seção 3.8). Módulo puro: não acessa banco nem sessão.
// Quem pode disparar cada transição (papel) é decidido em lib/auth/permissions.ts.

export const ROUTE_STATUSES = [
  "RASCUNHO",
  "LIBERADA_CARGA",
  "EM_ANDAMENTO",
  "AGUARDANDO_ACERTO",
  "CONCLUIDA",
] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

/**
 * Transições permitidas. Qualquer par fora desta tabela é rejeitado.
 *
 * - RASCUNHO -> LIBERADA_CARGA: "Liberar para carga" (congela a composição).
 * - LIBERADA_CARGA -> RASCUNHO: reabertura, antes de o motorista iniciar.
 * - LIBERADA_CARGA -> EM_ANDAMENTO: o motorista tocou em "Iniciar rota".
 * - EM_ANDAMENTO -> AGUARDANDO_ACERTO: todas as paradas têm desfecho.
 * - AGUARDANDO_ACERTO -> CONCLUIDA: acerto concluído na tela de fechamento.
 */
export const ROUTE_TRANSITIONS: Readonly<Record<RouteStatus, readonly RouteStatus[]>> = {
  RASCUNHO: ["LIBERADA_CARGA"],
  LIBERADA_CARGA: ["EM_ANDAMENTO", "RASCUNHO"],
  EM_ANDAMENTO: ["AGUARDANDO_ACERTO"],
  AGUARDANDO_ACERTO: ["CONCLUIDA"],
  CONCLUIDA: [],
};

export function canTransitionRoute(from: RouteStatus, to: RouteStatus): boolean {
  return ROUTE_TRANSITIONS[from].includes(to);
}

/** Só em RASCUNHO dá para adicionar, remover e reordenar pedidos. */
export function isRouteCompositionEditable(status: RouteStatus): boolean {
  return status === "RASCUNHO";
}

/** Romaneios só podem ser impressos depois da liberação para carga. */
export function isRoutePrintable(status: RouteStatus): boolean {
  return status !== "RASCUNHO";
}

/** O motorista registra entregas somente com a rota em andamento. */
export function canRecordDeliveries(status: RouteStatus): boolean {
  return status === "EM_ANDAMENTO";
}

export class InvalidRouteTransitionError extends Error {
  constructor(
    public readonly from: RouteStatus,
    public readonly to: RouteStatus,
  ) {
    super(`Não é possível mudar a rota de ${ROUTE_STATUS_LABELS[from]} para ${ROUTE_STATUS_LABELS[to]}.`);
    this.name = "InvalidRouteTransitionError";
  }
}

export function assertRouteTransition(from: RouteStatus, to: RouteStatus): void {
  if (!canTransitionRoute(from, to)) {
    throw new InvalidRouteTransitionError(from, to);
  }
}

export const ROUTE_STATUS_LABELS: Readonly<Record<RouteStatus, string>> = {
  RASCUNHO: "Rascunho",
  LIBERADA_CARGA: "Liberada para carga",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_ACERTO: "Aguardando acerto",
  CONCLUIDA: "Concluída",
};
