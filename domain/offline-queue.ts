// Fila offline das entregas (seção 5.7, "Fila offline e sincronização"). Só a lógica: ordem,
// backoff e separação de erros definitivos. O armazenamento (IndexedDB) e o envio (fetch) são
// injetados, então tudo é testado fora do navegador.

export type QueueStatus = "pendente" | "atencao";

export type QueueEntry = {
  clientRequestId: string;
  orderId: string;
  routeId: string;
  /** Quando o motorista confirmou a entrega (ms). Define a ordem de envio. */
  createdAt: number;
  status: QueueStatus;
  attempts: number;
  /** Antes disso o envio automático não tenta de novo (backoff). */
  nextAttemptAt: number;
  lastError: string | null;
};

export type SendResult =
  | { kind: "enviado" }
  /** O servidor recusou de vez (validação, rota reaberta...): vai para "Precisa de atenção". */
  | { kind: "definitivo"; message: string }
  /** Rede, servidor fora, limite de requisições: tenta de novo mais tarde. */
  | { kind: "temporario"; message: string }
  /** Sessão expirada: nada é enviado até o motorista entrar de novo. */
  | { kind: "sessao"; message: string };

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** 5 s, 10 s, 20 s, 40 s... até 5 minutos. */
export function backoffDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(attempts - 1, 20));
}

/** Resposta HTTP de erro -> tipo de falha. */
export function classifyHttpStatus(status: number): "definitivo" | "temporario" | "sessao" {
  if (status === 401) return "sessao";
  if (status === 408 || status === 425 || status === 429 || status >= 500 || status === 0) return "temporario";
  return "definitivo";
}

/** Novo estado do item depois de uma tentativa. Null = enviado, sai da fila. */
export function afterSend(entry: QueueEntry, result: SendResult, now: number): QueueEntry | null {
  switch (result.kind) {
    case "enviado":
      return null;
    case "definitivo":
      return { ...entry, status: "atencao", attempts: entry.attempts + 1, lastError: result.message };
    case "temporario": {
      const attempts = entry.attempts + 1;
      return { ...entry, attempts, nextAttemptAt: now + backoffDelayMs(attempts), lastError: result.message };
    }
    case "sessao":
      return { ...entry, lastError: result.message };
  }
}

/** Itens pendentes na ordem de envio: mais antigo primeiro. */
export function pendingInOrder(entries: ReadonlyArray<QueueEntry>): QueueEntry[] {
  return entries
    .filter((entry) => entry.status === "pendente")
    .sort((a, b) => a.createdAt - b.createdAt || a.clientRequestId.localeCompare(b.clientRequestId));
}

export function summarizeQueue(entries: ReadonlyArray<QueueEntry>): { pending: number; attention: number } {
  return {
    pending: entries.filter((entry) => entry.status === "pendente").length,
    attention: entries.filter((entry) => entry.status === "atencao").length,
  };
}

/** Quando o envio automático deve tentar de novo (o primeiro da fila manda). Null = nada pendente. */
export function nextWakeAt(entries: ReadonlyArray<QueueEntry>): number | null {
  const head = pendingInOrder(entries)[0];
  return head ? head.nextAttemptAt : null;
}

/** "Precisa de atenção" -> volta para a fila, para tentar já. */
export function retryEntry(entry: QueueEntry, now: number): QueueEntry {
  return { ...entry, status: "pendente", nextAttemptAt: now };
}

export type QueueStore = {
  list(): Promise<QueueEntry[]>;
  put(entry: QueueEntry): Promise<void>;
  remove(clientRequestId: string): Promise<void>;
};

export type RunResult = {
  sent: number;
  movedToAttention: number;
  /** Por que a rodada parou. */
  stop: "vazia" | "aguardando" | "temporario" | "sessao";
};

/**
 * Uma rodada de envio. Os itens vão em ordem; uma falha temporária ou de sessão para a rodada
 * (o próximo item teria o mesmo problema e a ordem se mantém). Uma falha definitiva tira só
 * aquele item da fila automática e a rodada segue. `force` ignora o backoff (botão
 * "Sincronizar agora", volta da conexão, abertura do app).
 */
export async function runQueue(store: QueueStore, send: (entry: QueueEntry) => Promise<SendResult>, options: { now: () => number; force?: boolean }): Promise<RunResult> {
  const result: RunResult = { sent: 0, movedToAttention: 0, stop: "vazia" };
  for (const entry of pendingInOrder(await store.list())) {
    if (!options.force && entry.nextAttemptAt > options.now()) {
      result.stop = "aguardando";
      return result;
    }
    let outcome: SendResult;
    try {
      outcome = await send(entry);
    } catch (error) {
      outcome = { kind: "temporario", message: error instanceof Error ? error.message : "Falha de conexão." };
    }
    const next = afterSend(entry, outcome, options.now());
    if (next === null) {
      await store.remove(entry.clientRequestId);
      result.sent += 1;
      continue;
    }
    await store.put(next);
    if (outcome.kind === "definitivo") {
      result.movedToAttention += 1;
      continue;
    }
    result.stop = outcome.kind === "sessao" ? "sessao" : "temporario";
    return result;
  }
  return result;
}
