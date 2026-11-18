// Armazenamento e envio da fila do motorista, fora do navegador: IndexedDB simulado
// (fake-indexeddb) e fetch simulado. A lógica de ordem e backoff está em domain/offline-queue.

import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sendQueueRecord } from "./api";
import { DriverStore } from "./db";
import type { LocalOutcome, QueueRecord } from "./types";

let seq = 0;

function record(overrides: Partial<QueueRecord> = {}): QueueRecord {
  seq += 1;
  return {
    clientRequestId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    orderId: `pedido-${seq}`,
    routeId: "rota-1",
    createdAt: seq,
    status: "pendente",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    label: `Parada ${seq}`,
    payload: {
      clientRequestId: "",
      orderId: `pedido-${seq}`,
      outcome: "ENTREGUE",
      deliveredAt: "2026-11-18T12:00:00.000Z",
      items: [],
      failureReason: null,
      failureNote: null,
      cashCents: 100,
      pixCents: 0,
      confirmDifferentAmount: false,
      containers: [],
      receiverName: "Maria",
      receiverDocument: null,
      location: null,
    },
    files: [
      { kind: "SIGNATURE", contentType: "image/png", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) },
      { kind: "PHOTO", contentType: "image/jpeg", blob: new Blob([new Uint8Array([4, 5, 6, 7])], { type: "image/jpeg" }) },
    ],
    uploaded: null,
    ...overrides,
  };
}

const outcome = (item: QueueRecord): LocalOutcome => ({ orderId: item.orderId, routeId: item.routeId, outcome: "ENTREGUE", clientRequestId: item.clientRequestId, confirmedAt: 1, synced: false });

type Call = { url: string; method: string; body: unknown };

/** fetch simulado: responde conforme a URL e registra cada chamada. */
function mockFetch(responder: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    const call = { url, method: init?.method ?? "GET", body };
    calls.push(call);
    const response = responder(call);
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("armazenamento", () => {
  it("cada usuário tem o próprio banco", async () => {
    const a = await DriverStore.open("usuario-a");
    const b = await DriverStore.open("usuario-b");
    const item = record();
    await a.recordDelivery(outcome(item), item);
    expect(await a.listQueue()).toHaveLength(1);
    expect(await b.listQueue()).toHaveLength(0);
    a.close();
    b.close();
  });

  it("atualizar o estado de envio preserva arquivos e chaves já enviadas", async () => {
    const store = await DriverStore.open("usuario-estado");
    const item = record({ uploaded: { signatureKey: "k1", photoKeys: ["k2"] } });
    await store.recordDelivery(outcome(item), item);
    await store.updateQueueState({ ...item, uploaded: null, status: "atencao", attempts: 3, lastError: "Rota reaberta." } as QueueRecord);
    const saved = await store.getQueueRecord(item.clientRequestId);
    expect(saved).toMatchObject({ status: "atencao", attempts: 3, lastError: "Rota reaberta.", uploaded: { signatureKey: "k1", photoKeys: ["k2"] } });
    expect(saved?.files).toHaveLength(2);
    store.close();
  });

  it("descartar tira o item da fila e reabre a parada no celular", async () => {
    const store = await DriverStore.open("usuario-descartar");
    const item = record();
    await store.recordDelivery(outcome(item), item);
    await store.discard(item.clientRequestId);
    expect(await store.listQueue()).toEqual([]);
    expect(await store.progressForRoute("rota-1")).toEqual([]);
    store.close();
  });
});

describe("envio de um item", () => {
  it("presign, PUT de cada arquivo direto no storage e finalização com as chaves", async () => {
    const store = await DriverStore.open("usuario-envio");
    const item = record();
    await store.recordDelivery(outcome(item), item);
    const calls = mockFetch((call) => {
      if (call.url.endsWith("/presign")) {
        return { status: 200, body: { ok: true, data: { status: "ok", uploads: [{ key: "k-assinatura", url: "https://storage/a", headers: {} }, { key: "k-foto", url: "https://storage/f", headers: {} }] } } };
      }
      if (call.url.startsWith("https://storage/")) return { status: 200 };
      return { status: 200, body: { ok: true, data: { orderId: item.orderId } } };
    });

    expect(await sendQueueRecord(store, item.clientRequestId)).toEqual({ kind: "enviado" });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /api/motorista/uploads/presign",
      "PUT https://storage/a",
      "PUT https://storage/f",
      "POST /api/motorista/entregas",
    ]);
    expect(calls[0]?.body).toMatchObject({ files: [{ kind: "SIGNATURE", contentType: "image/png", sizeBytes: 3 }, { kind: "PHOTO", contentType: "image/jpeg", sizeBytes: 4 }] });
    expect(calls[3]?.body).toMatchObject({ clientRequestId: item.clientRequestId, signatureKey: "k-assinatura", photoKeys: ["k-foto"] });
    expect((await store.progressForRoute("rota-1")).find((p) => p.orderId === item.orderId)?.synced).toBe(true);
    store.close();
  });

  it("finalização falhou: a próxima tentativa não sobe os arquivos de novo", async () => {
    const store = await DriverStore.open("usuario-retentativa");
    const item = record({ uploaded: { signatureKey: "k1", photoKeys: [] }, files: [] });
    await store.recordDelivery(outcome(item), item);
    const calls = mockFetch(() => ({ status: 503, body: { ok: false, error: "Fora do ar.", code: "INESPERADO" } }));
    expect(await sendQueueRecord(store, item.clientRequestId)).toEqual({ kind: "temporario", message: "Fora do ar." });
    expect(calls.map((call) => call.url)).toEqual(["/api/motorista/entregas"]);
    store.close();
  });

  it("arquivo ausente no storage: esquece as chaves para subir tudo de novo", async () => {
    const store = await DriverStore.open("usuario-arquivo");
    const item = record({ uploaded: { signatureKey: "k1", photoKeys: [] } });
    await store.recordDelivery(outcome(item), item);
    mockFetch(() => ({ status: 422, body: { ok: false, error: "Um arquivo do comprovante não chegou ao armazenamento.", code: "ARQUIVO" } }));
    expect((await sendQueueRecord(store, item.clientRequestId)).kind).toBe("temporario");
    expect((await store.getQueueRecord(item.clientRequestId))?.uploaded).toBeNull();
    store.close();
  });

  it("já processado no servidor conta como enviado; recusa definitiva e sessão são separadas", async () => {
    const store = await DriverStore.open("usuario-resultados");
    const item = record();
    await store.recordDelivery(outcome(item), item);
    mockFetch(() => ({ status: 200, body: { ok: true, data: { status: "ja-processado" } } }));
    expect(await sendQueueRecord(store, item.clientRequestId)).toEqual({ kind: "enviado" });

    mockFetch(() => ({ status: 409, body: { ok: false, error: "A rota não está mais em andamento.", code: "CONFLITO" } }));
    expect(await sendQueueRecord(store, item.clientRequestId)).toEqual({ kind: "definitivo", message: "A rota não está mais em andamento." });

    mockFetch(() => ({ status: 401, body: { ok: false, error: "Sua sessão expirou.", code: "SESSAO" } }));
    expect((await sendQueueRecord(store, item.clientRequestId)).kind).toBe("sessao");

    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await sendQueueRecord(store, item.clientRequestId)).toEqual({ kind: "temporario", message: "Sem conexão com o servidor." });
    store.close();
  });
});
