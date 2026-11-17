import { describe, expect, it } from "vitest";

import {
  InvalidOrderTransitionError,
  ORDER_STATUSES,
  type OrderStatus,
  assertOrderTransition,
  canTransitionOrder,
  isFinalOrderStatus,
  isOrderEditable,
  isOrderReschedulable,
} from "./order-status";
import {
  InvalidRouteTransitionError,
  ROUTE_STATUSES,
  type RouteStatus,
  assertRouteTransition,
  canRecordDeliveries,
  canTransitionRoute,
  isRouteCompositionEditable,
  isRoutePrintable,
} from "./route-status";

// As listas abaixo são a especificação (seção 3.8) escrita de novo, de propósito:
// se alguém mexer na tabela do módulo, este teste acusa.
const VALID_ORDER_TRANSITIONS: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
  ["PENDENTE", "EM_ROTA"],
  ["PENDENTE", "CANCELADO"],
  ["EM_ROTA", "ENTREGUE"],
  ["EM_ROTA", "ENTREGUE_PARCIAL"],
  ["EM_ROTA", "NAO_ENTREGUE"],
  ["EM_ROTA", "PENDENTE"],
];

const VALID_ROUTE_TRANSITIONS: ReadonlyArray<readonly [RouteStatus, RouteStatus]> = [
  ["RASCUNHO", "LIBERADA_CARGA"],
  ["LIBERADA_CARGA", "EM_ANDAMENTO"],
  ["LIBERADA_CARGA", "RASCUNHO"],
  ["EM_ANDAMENTO", "AGUARDANDO_ACERTO"],
  ["AGUARDANDO_ACERTO", "CONCLUIDA"],
];

function allPairs<T extends string>(statuses: readonly T[]): Array<readonly [T, T]> {
  return statuses.flatMap((from) => statuses.map((to) => [from, to] as const));
}

const isIn = <T extends string>(list: ReadonlyArray<readonly [T, T]>, from: T, to: T) =>
  list.some(([f, t]) => f === from && t === to);

describe("máquina de estados do pedido", () => {
  it.each(VALID_ORDER_TRANSITIONS)("permite %s -> %s", (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(true);
    expect(() => assertOrderTransition(from, to)).not.toThrow();
  });

  const invalid = allPairs(ORDER_STATUSES).filter(([from, to]) => !isIn(VALID_ORDER_TRANSITIONS, from, to));

  it("cobre todos os 36 pares possíveis", () => {
    expect(VALID_ORDER_TRANSITIONS.length + invalid.length).toBe(36);
    expect(invalid).toHaveLength(30);
  });

  it.each(invalid)("rejeita %s -> %s", (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(false);
    expect(() => assertOrderTransition(from, to)).toThrow(InvalidOrderTransitionError);
  });

  it("ENTREGUE, ENTREGUE_PARCIAL, NAO_ENTREGUE e CANCELADO são finais", () => {
    // Reagendar não reabre o pedido não entregue: cria outro (decisão do dono do produto).
    expect(ORDER_STATUSES.filter(isFinalOrderStatus)).toEqual(["ENTREGUE", "ENTREGUE_PARCIAL", "NAO_ENTREGUE", "CANCELADO"]);
  });

  it("só NAO_ENTREGUE pode ser reagendado", () => {
    expect(ORDER_STATUSES.filter(isOrderReschedulable)).toEqual(["NAO_ENTREGUE"]);
  });

  it("só PENDENTE é editável", () => {
    expect(ORDER_STATUSES.filter(isOrderEditable)).toEqual(["PENDENTE"]);
  });

  it("a mensagem de erro é em português e legível", () => {
    expect(() => assertOrderTransition("ENTREGUE", "PENDENTE")).toThrow(
      "Não é possível mudar o pedido de Entregue para Pendente.",
    );
  });
});

describe("máquina de estados da rota", () => {
  it.each(VALID_ROUTE_TRANSITIONS)("permite %s -> %s", (from, to) => {
    expect(canTransitionRoute(from, to)).toBe(true);
    expect(() => assertRouteTransition(from, to)).not.toThrow();
  });

  const invalid = allPairs(ROUTE_STATUSES).filter(([from, to]) => !isIn(VALID_ROUTE_TRANSITIONS, from, to));

  it("cobre todos os 25 pares possíveis", () => {
    expect(VALID_ROUTE_TRANSITIONS.length + invalid.length).toBe(25);
    expect(invalid).toHaveLength(20);
  });

  it.each(invalid)("rejeita %s -> %s", (from, to) => {
    expect(canTransitionRoute(from, to)).toBe(false);
    expect(() => assertRouteTransition(from, to)).toThrow(InvalidRouteTransitionError);
  });

  it("composição só é editável em RASCUNHO", () => {
    expect(ROUTE_STATUSES.filter(isRouteCompositionEditable)).toEqual(["RASCUNHO"]);
  });

  it("impressão só depois da liberação", () => {
    expect(ROUTE_STATUSES.filter(isRoutePrintable)).toEqual([
      "LIBERADA_CARGA",
      "EM_ANDAMENTO",
      "AGUARDANDO_ACERTO",
      "CONCLUIDA",
    ]);
  });

  it("entregas só são registradas com a rota em andamento", () => {
    expect(ROUTE_STATUSES.filter(canRecordDeliveries)).toEqual(["EM_ANDAMENTO"]);
  });

  it("CONCLUIDA não tem saída", () => {
    for (const to of ROUTE_STATUSES) {
      expect(canTransitionRoute("CONCLUIDA", to)).toBe(false);
    }
  });
});
