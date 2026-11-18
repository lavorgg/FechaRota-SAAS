// Sincronização da fila (seção 5.7, passo 3): ao abrir o app, ao voltar a conexão, ao voltar ao
// primeiro plano, em tentativas com backoff (até 5 minutos) e no botão "Sincronizar agora".
// Não usa Background Sync (o Safari não tem): só envia com o app aberto.

import { nextWakeAt, retryEntry, runQueue, summarizeQueue } from "../../domain/offline-queue";
import { sendQueueRecord } from "./api";
import type { DriverStore } from "./db";

export type SyncState = {
  pending: number;
  attention: number;
  running: boolean;
  online: boolean;
  lastSyncAt: number | null;
  /** Sessão expirada: nada sai até entrar de novo. */
  sessionExpired: boolean;
  lastError: string | null;
};

export class SyncEngine {
  private state: SyncState = { pending: 0, attention: 0, running: false, online: true, lastSyncAt: null, sessionExpired: false, lastError: null };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly store: DriverStore) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): SyncState => this.state;

  private set(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  async refresh(): Promise<void> {
    const queue = await this.store.listQueue();
    this.set({ ...summarizeQueue(queue), lastSyncAt: await this.store.getLastSync(), online: navigator.onLine });
  }

  start(): void {
    const onOnline = () => {
      this.set({ online: true });
      void this.run(true);
    };
    const onOffline = () => this.set({ online: false });
    const onVisible = () => {
      if (document.visibilityState === "visible") void this.run(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    this.cleanups.push(
      () => window.removeEventListener("online", onOnline),
      () => window.removeEventListener("offline", onOffline),
      () => document.removeEventListener("visibilitychange", onVisible),
    );
    void this.refresh().then(() => this.run(true));
  }

  stop(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Uma rodada de envio. Rodadas não se sobrepõem (nem entre abas, quando o navegador permite). */
  run(force = false): Promise<void> {
    if (this.running) return this.running;
    this.running = this.withLock(() => this.runOnce(force)).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async withLock(task: () => Promise<void>): Promise<void> {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) return task();
    await locks.request("fecharota-fila", { ifAvailable: true }, async (lock) => {
      if (lock) await task();
    });
  }

  private async runOnce(force: boolean): Promise<void> {
    const queue = await this.store.listQueue();
    if (queue.every((entry) => entry.status !== "pendente")) {
      await this.refresh();
      this.schedule();
      return;
    }
    this.set({ running: true });
    const result = await runQueue(
      {
        list: () => this.store.listQueue(),
        put: (entry) => this.store.updateQueueState(entry),
        remove: (id) => this.store.removeQueueRecord(id),
      },
      (entry) => sendQueueRecord(this.store, entry.clientRequestId),
      { now: () => Date.now(), force },
    );
    if (result.sent > 0) await this.store.setLastSync(Date.now());
    const remaining = await this.store.listQueue();
    const head = remaining.find((entry) => entry.status === "pendente");
    this.set({
      running: false,
      sessionExpired: result.stop === "sessao",
      lastError: result.stop === "temporario" || result.stop === "sessao" ? (head?.lastError ?? null) : null,
    });
    await this.refresh();
    this.schedule();
  }

  /** Agenda a próxima tentativa automática para quando o backoff do primeiro item vencer. */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.store.listQueue().then((queue) => {
      const wake = nextWakeAt(queue);
      if (wake === null || this.state.sessionExpired) return;
      this.timer = setTimeout(() => void this.run(false), Math.max(1_000, wake - Date.now()));
    });
  }

  async retry(clientRequestId: string): Promise<void> {
    const record = await this.store.getQueueRecord(clientRequestId);
    if (!record) return;
    await this.store.updateQueueState(retryEntry(record, Date.now()));
    await this.run(true);
  }

  async discard(clientRequestId: string): Promise<void> {
    await this.store.discard(clientRequestId);
    await this.refresh();
  }
}
