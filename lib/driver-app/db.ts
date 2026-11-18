// IndexedDB do app do motorista. Um banco por usuário ("fecharota-motorista-{id}"): num celular
// compartilhado, um motorista nunca vê a rota ou a fila do outro, e o logout apaga o banco.

import { type DBSchema, type IDBPDatabase, deleteDB, openDB } from "idb";

import type { QueueEntry } from "../../domain/offline-queue";
import type { DriverUser, LocalOutcome, QueueRecord, StoredRoute, TodayList } from "./types";

interface DriverSchema extends DBSchema {
  rotas: { key: string; value: StoredRoute };
  progresso: { key: string; value: LocalOutcome; indexes: { porRota: string } };
  fila: { key: string; value: QueueRecord };
  meta: { key: string; value: unknown };
}

const VERSION = 1;
const USER_KEY = "fecharota:motorista:usuario";

export function driverDbName(userId: string): string {
  return `fecharota-motorista-${userId}`;
}

export class DriverStore {
  private constructor(private readonly db: IDBPDatabase<DriverSchema>) {}

  static async open(userId: string): Promise<DriverStore> {
    const db = await openDB<DriverSchema>(driverDbName(userId), VERSION, {
      upgrade(database) {
        database.createObjectStore("rotas");
        database.createObjectStore("progresso", { keyPath: "orderId" }).createIndex("porRota", "routeId");
        database.createObjectStore("fila", { keyPath: "clientRequestId" });
        database.createObjectStore("meta");
      },
    });
    return new DriverStore(db);
  }

  close(): void {
    this.db.close();
  }

  // Rotas baixadas ----------------------------------------------------------
  async saveRoute(route: StoredRoute): Promise<void> {
    await this.db.put("rotas", route, route.bundle.route.id);
  }
  async getRoute(routeId: string): Promise<StoredRoute | undefined> {
    return this.db.get("rotas", routeId);
  }

  // Lista do dia (para abrir sem sinal) -------------------------------------
  async saveToday(list: TodayList): Promise<void> {
    await this.db.put("meta", list, "hoje");
  }
  async getToday(): Promise<TodayList | undefined> {
    return (await this.db.get("meta", "hoje")) as TodayList | undefined;
  }
  async setLastSync(at: number): Promise<void> {
    await this.db.put("meta", at, "ultimaSincronizacao");
  }
  async getLastSync(): Promise<number | null> {
    return ((await this.db.get("meta", "ultimaSincronizacao")) as number | undefined) ?? null;
  }

  // Desfechos registrados no celular -----------------------------------------
  async progressForRoute(routeId: string): Promise<LocalOutcome[]> {
    return this.db.getAllFromIndex("progresso", "porRota", routeId);
  }
  async markSynced(orderId: string): Promise<void> {
    const current = await this.db.get("progresso", orderId);
    if (current) await this.db.put("progresso", { ...current, synced: true });
  }

  /** Confirmação da entrega: desfecho local e item da fila gravados juntos. */
  async recordDelivery(outcome: LocalOutcome, record: QueueRecord): Promise<void> {
    const tx = this.db.transaction(["progresso", "fila"], "readwrite");
    await Promise.all([tx.objectStore("progresso").put(outcome), tx.objectStore("fila").put(record), tx.done]);
  }

  /** Descartar um item que o servidor recusou: a parada volta a ficar aberta no celular. */
  async discard(clientRequestId: string): Promise<void> {
    const record = await this.db.get("fila", clientRequestId);
    const tx = this.db.transaction(["progresso", "fila"], "readwrite");
    const deletions = [tx.objectStore("fila").delete(clientRequestId)];
    if (record) deletions.push(tx.objectStore("progresso").delete(record.orderId));
    await Promise.all([...deletions, tx.done]);
  }

  // Fila ---------------------------------------------------------------------
  async listQueue(): Promise<QueueRecord[]> {
    return this.db.getAll("fila");
  }
  async getQueueRecord(clientRequestId: string): Promise<QueueRecord | undefined> {
    return this.db.get("fila", clientRequestId);
  }
  async saveQueueRecord(record: QueueRecord): Promise<void> {
    await this.db.put("fila", record);
  }
  /** Atualiza só o estado de envio, preservando formulário, arquivos e chaves já enviadas. */
  async updateQueueState(entry: QueueEntry): Promise<void> {
    const tx = this.db.transaction("fila", "readwrite");
    const current = await tx.store.get(entry.clientRequestId);
    if (current) {
      await tx.store.put({ ...current, status: entry.status, attempts: entry.attempts, nextAttemptAt: entry.nextAttemptAt, lastError: entry.lastError });
    }
    await tx.done;
  }
  async removeQueueRecord(clientRequestId: string): Promise<void> {
    await this.db.delete("fila", clientRequestId);
  }
}

/** Quem usou o app por último neste aparelho, para abrir sem sinal. Só nome e id. */
export function rememberUser(user: DriverUser): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Navegação privada sem armazenamento: o app funciona só online.
  }
}

export function rememberedUser(): DriverUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as DriverUser) : null;
  } catch {
    return null;
  }
}

/** Logout: apaga o banco do usuário e a lembrança dele neste aparelho. */
export async function forgetUser(userId: string): Promise<void> {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // Ignora: sem localStorage não há o que apagar.
  }
  await deleteDB(driverDbName(userId), { blocked() {} });
}
