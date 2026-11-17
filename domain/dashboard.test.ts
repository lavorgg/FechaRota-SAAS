import { describe, expect, it } from "vitest";

import { type DashboardOrder, isSettlementOverdue, summarizeDay } from "./dashboard";

function order(overrides: Partial<DashboardOrder>): DashboardOrder {
  return { status: "PENDENTE", paymentStatus: "A_RECEBER", amountToCollectCents: 0, routeId: null, proof: null, ...overrides };
}

describe("summarizeDay", () => {
  it("dia sem nada", () => {
    const summary = summarizeDay([], []);
    expect(summary.orders.total).toBe(0);
    expect(Object.values(summary.orders.byStatus).every((n) => n === 0)).toBe(true);
    expect(summary.money).toEqual({ toCollectCents: 0, receivedCents: 0, receivedCashCents: 0, receivedPixCents: 0, pixToConfirmCents: 0 });
    expect(summary.routes.total).toBe(0);
    expect(summary.deliveries).toEqual({ completed: 0, pending: 0, notDelivered: 0 });
  });

  it("conta pedidos por situação, incluindo cancelados no total", () => {
    const summary = summarizeDay(
      [
        order({ status: "PENDENTE" }),
        order({ status: "PENDENTE", routeId: "r1" }),
        order({ status: "EM_ROTA", routeId: "r1" }),
        order({ status: "ENTREGUE", routeId: "r1" }),
        order({ status: "ENTREGUE_PARCIAL", routeId: "r1" }),
        order({ status: "NAO_ENTREGUE", routeId: "r1" }),
        order({ status: "CANCELADO" }),
      ],
      [],
    );
    expect(summary.orders.total).toBe(7);
    expect(summary.orders.byStatus).toEqual({ PENDENTE: 2, EM_ROTA: 1, ENTREGUE: 1, ENTREGUE_PARCIAL: 1, NAO_ENTREGUE: 1, CANCELADO: 1 });
    expect(summary.deliveries).toEqual({ completed: 2, pending: 3, notDelivered: 1 });
    expect(summary.pendingWithoutRoute).toBe(1);
  });

  it("dinheiro: a receber exclui cancelados; Pix só conta como recebido depois de conferido", () => {
    const summary = summarizeDay(
      [
        order({ status: "ENTREGUE", paymentStatus: "RECEBIDO", amountToCollectCents: 10000, proof: { cashCollectedCents: 10000, pixCollectedCents: 0 } }),
        order({ status: "ENTREGUE", paymentStatus: "RECEBIDO", amountToCollectCents: 5000, proof: { cashCollectedCents: 0, pixCollectedCents: 5000 } }),
        order({ status: "ENTREGUE", paymentStatus: "PIX_A_CONFERIR", amountToCollectCents: 7000, proof: { cashCollectedCents: 2000, pixCollectedCents: 5000 } }),
        order({ status: "ENTREGUE", paymentStatus: "FATURADO", amountToCollectCents: 0, proof: { cashCollectedCents: 0, pixCollectedCents: 0 } }),
        order({ status: "NAO_ENTREGUE", paymentStatus: "NAO_RECEBIDO", amountToCollectCents: 3000, proof: { cashCollectedCents: 0, pixCollectedCents: 0 } }),
        order({ status: "PENDENTE", amountToCollectCents: 4000 }),
        order({ status: "CANCELADO", amountToCollectCents: 99999 }),
      ],
      [],
    );
    expect(summary.money).toEqual({
      toCollectCents: 10000 + 5000 + 7000 + 0 + 3000 + 4000,
      receivedCashCents: 10000 + 2000,
      receivedPixCents: 5000,
      pixToConfirmCents: 5000,
      receivedCents: 12000 + 5000,
    });
  });

  it("conta rotas por situação", () => {
    const summary = summarizeDay([], [{ status: "RASCUNHO" }, { status: "EM_ANDAMENTO" }, { status: "EM_ANDAMENTO" }, { status: "CONCLUIDA" }]);
    expect(summary.routes).toEqual({
      total: 4,
      byStatus: { RASCUNHO: 1, LIBERADA_CARGA: 0, EM_ANDAMENTO: 2, AGUARDANDO_ACERTO: 0, CONCLUIDA: 1 },
    });
  });
});

describe("isSettlementOverdue", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  it("alerta só depois de 12 horas aguardando acerto", () => {
    expect(isSettlementOverdue({ status: "AGUARDANDO_ACERTO", finishedAt: hoursAgo(12.01), updatedAt: hoursAgo(1) }, now)).toBe(true);
    expect(isSettlementOverdue({ status: "AGUARDANDO_ACERTO", finishedAt: hoursAgo(12), updatedAt: hoursAgo(1) }, now)).toBe(false);
    expect(isSettlementOverdue({ status: "AGUARDANDO_ACERTO", finishedAt: hoursAgo(3), updatedAt: hoursAgo(30) }, now)).toBe(false);
  });

  it("sem fim registrado, conta da última alteração", () => {
    expect(isSettlementOverdue({ status: "AGUARDANDO_ACERTO", finishedAt: null, updatedAt: hoursAgo(13) }, now)).toBe(true);
  });

  it("outras situações nunca alertam", () => {
    for (const status of ["RASCUNHO", "LIBERADA_CARGA", "EM_ANDAMENTO", "CONCLUIDA"] as const) {
      expect(isSettlementOverdue({ status, finishedAt: hoursAgo(100), updatedAt: hoursAgo(100) }, now)).toBe(false);
    }
  });
});
