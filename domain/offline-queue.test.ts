import { describe, expect, it } from "vitest";

import {
  BACKOFF_MAX_MS,
  type QueueEntry,
  type QueueStore,
  type SendResult,
  afterSend,
  backoffDelayMs,
  classifyHttpStatus,
  nextWakeAt,
  pendingInOrder,
  retryEntry,
  runQueue,
  summarizeQueue,
} from "./offline-queue";

const entry = (id: string, createdAt: number, overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  clientRequestId: id,
  orderId: `pedido-${id}`,
  routeId: "rota",
  createdAt,
  status: "pendente",
  attempts: 0,
  nextAttemptAt: 0,
  lastError: null,
  ...overrides,
});

function memoryStore(initial: QueueEntry[]): QueueStore & { entries: Map<string, QueueEntry> } {
  const entries = new Map(initial.map((item) => [item.clientRequestId, item]));
  return {
    entries,
    list: async () => [...entries.values()],
    put: async (item) => void entries.set(item.clientRequestId, item),
    remove: async (id) => void entries.delete(id),
  };
}

describe("backoff e classificação", () => {
  it("dobra a partir de 5 s até no máximo 5 minutos", () => {
    expect([1, 2, 3, 4].map(backoffDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000]);
    expect(backoffDelayMs(7)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelayMs(50)).toBe(BACKOFF_MAX_MS);
  });

  it("401 é sessão; 408, 429 e 5xx são temporários; o resto dos 4xx é definitivo", () => {
    expect(classifyHttpStatus(401)).toBe("sessao");
    expect([0, 408, 425, 429, 500, 502, 503].map(classifyHttpStatus)).toEqual(Array(7).fill("temporario"));
    expect([400, 403, 404, 409, 413, 422].map(classifyHttpStatus)).toEqual(Array(6).fill("definitivo"));
  });

  it("estado depois de cada resultado", () => {
    const item = entry("a", 1);
    expect(afterSend(item, { kind: "enviado" }, 100)).toBeNull();
    expect(afterSend(item, { kind: "definitivo", message: "Rota reaberta." }, 100)).toMatchObject({ status: "atencao", lastError: "Rota reaberta.", attempts: 1 });
    expect(afterSend(item, { kind: "temporario", message: "Sem conexão." }, 100)).toMatchObject({ status: "pendente", attempts: 1, nextAttemptAt: 5_100 });
    expect(afterSend(item, { kind: "sessao", message: "Entre de novo." }, 100)).toMatchObject({ status: "pendente", attempts: 0, nextAttemptAt: 0 });
    expect(retryEntry({ ...item, status: "atencao" }, 500)).toMatchObject({ status: "pendente", nextAttemptAt: 500 });
  });

  it("ordem, resumo e próxima tentativa", () => {
    const items = [entry("c", 30), entry("a", 10, { nextAttemptAt: 70 }), entry("b", 20, { status: "atencao" })];
    expect(pendingInOrder(items).map((item) => item.clientRequestId)).toEqual(["a", "c"]);
    expect(summarizeQueue(items)).toEqual({ pending: 2, attention: 1 });
    expect(nextWakeAt(items)).toBe(70);
    expect(nextWakeAt([])).toBeNull();
  });
});

describe("rodada de envio", () => {
  it("envia em ordem e esvazia a fila", async () => {
    const store = memoryStore([entry("b", 2), entry("a", 1)]);
    const sent: string[] = [];
    const result = await runQueue(store, async (item) => (sent.push(item.clientRequestId), { kind: "enviado" }), { now: () => 1000 });
    expect(sent).toEqual(["a", "b"]);
    expect(result).toEqual({ sent: 2, movedToAttention: 0, stop: "vazia" });
    expect(store.entries.size).toBe(0);
  });

  it("erro definitivo tira o item da fila automática e a rodada continua", async () => {
    const store = memoryStore([entry("a", 1), entry("b", 2)]);
    const responses: Record<string, SendResult> = { a: { kind: "definitivo", message: "A rota foi reaberta pelo escritório." }, b: { kind: "enviado" } };
    const result = await runQueue(store, async (item) => responses[item.clientRequestId] as SendResult, { now: () => 1000 });
    expect(result).toEqual({ sent: 1, movedToAttention: 1, stop: "vazia" });
    expect(store.entries.get("a")).toMatchObject({ status: "atencao", lastError: "A rota foi reaberta pelo escritório." });
  });

  it("falha temporária para a rodada e agenda backoff; exceção de rede conta como temporária", async () => {
    const store = memoryStore([entry("a", 1), entry("b", 2)]);
    const sent: string[] = [];
    const result = await runQueue(
      store,
      async (item) => {
        sent.push(item.clientRequestId);
        throw new TypeError("Failed to fetch");
      },
      { now: () => 1000 },
    );
    expect(sent).toEqual(["a"]);
    expect(result.stop).toBe("temporario");
    expect(store.entries.get("a")).toMatchObject({ attempts: 1, nextAttemptAt: 6_000, lastError: "Failed to fetch" });
  });

  it("sessão expirada para tudo sem mexer nas tentativas", async () => {
    const store = memoryStore([entry("a", 1), entry("b", 2)]);
    const result = await runQueue(store, async () => ({ kind: "sessao", message: "Entre de novo para enviar." }), { now: () => 1000 });
    expect(result.stop).toBe("sessao");
    expect(store.entries.get("a")).toMatchObject({ attempts: 0, lastError: "Entre de novo para enviar." });
    expect(store.entries.get("b")?.lastError).toBeNull();
  });

  it("respeita o backoff do primeiro da fila, a não ser que seja forçado", async () => {
    const store = memoryStore([entry("a", 1, { nextAttemptAt: 5_000 }), entry("b", 2)]);
    const sent: string[] = [];
    const send = async (item: QueueEntry): Promise<SendResult> => (sent.push(item.clientRequestId), { kind: "enviado" });
    expect((await runQueue(store, send, { now: () => 1000 })).stop).toBe("aguardando");
    expect(sent).toEqual([]);
    expect(await runQueue(store, send, { now: () => 1000, force: true })).toEqual({ sent: 2, movedToAttention: 0, stop: "vazia" });
  });
});
