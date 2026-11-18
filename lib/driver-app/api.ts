// Chamadas do celular aos endpoints /api/motorista/* (seção 5.7) e o envio de um item da fila
// (passos 2a a 2d: presign, PUT direto no storage, finalização).

import { type SendResult, classifyHttpStatus } from "../../domain/offline-queue";
import type { DriverRouteBundle, DriverRouteDTO } from "../services/driver-routes";
import type { UserRole } from "../auth/permissions";
import type { DriverStore } from "./db";
import type { QueueRecord } from "./types";

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code: string };

/** Erro de rede (sem sinal, DNS, conexão caiu) vira status 0. */
async function call<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, status: 0, error: "Sem conexão com o servidor.", code: "REDE" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const parsed = body as { ok?: boolean; data?: T; error?: string; code?: string } | null;
  if (response.ok && parsed?.ok) return { ok: true, data: parsed.data as T };
  return { ok: false, status: response.status, error: parsed?.error ?? "O servidor não respondeu como esperado.", code: parsed?.code ?? "INESPERADO" };
}

export type TodayResponse = { user: { id: string; name: string; role: UserRole }; companyName: string; date: string; routes: DriverRouteDTO[] };

export const fetchToday = () => call<TodayResponse>("/api/motorista/hoje");
export const startRoute = (routeId: string) => call<DriverRouteBundle>(`/api/motorista/rotas/${encodeURIComponent(routeId)}/iniciar`, { method: "POST", body: {} });
export const fetchRoute = (routeId: string) => call<DriverRouteBundle>(`/api/motorista/rotas/${encodeURIComponent(routeId)}`);

type PresignResult = { status: "ja-processado" } | { status: "ok"; uploads: Array<{ key: string; url: string; headers: Record<string, string> }> };

function failure(response: { status: number; error: string }): SendResult {
  return { kind: classifyHttpStatus(response.status), message: response.error };
}

/** Envia um item da fila. Nunca lança: devolve o tipo do resultado para a fila decidir. */
export async function sendQueueRecord(store: DriverStore, clientRequestId: string): Promise<SendResult> {
  const record: QueueRecord | undefined = await store.getQueueRecord(clientRequestId);
  if (!record) return { kind: "enviado" };

  let uploaded = record.uploaded;
  if (!uploaded && record.files.length > 0) {
    const presign = await call<PresignResult>("/api/motorista/uploads/presign", {
      method: "POST",
      body: { clientRequestId, orderId: record.orderId, files: record.files.map((file) => ({ kind: file.kind, contentType: file.contentType, sizeBytes: file.blob.size })) },
    });
    if (!presign.ok) return failure(presign);
    if (presign.data.status === "ja-processado") {
      await store.markSynced(record.orderId);
      return { kind: "enviado" };
    }
    const uploads = presign.data.uploads;
    for (const [index, upload] of uploads.entries()) {
      const file = record.files[index];
      if (!file) return { kind: "definitivo", message: "Arquivo do comprovante sumiu do celular." };
      try {
        const response = await fetch(upload.url, { method: "PUT", body: file.blob, headers: upload.headers });
        if (!response.ok) return { kind: "temporario", message: "O envio da foto ou da assinatura falhou. Tentando de novo." };
      } catch {
        return { kind: "temporario", message: "Sem conexão para enviar a foto ou a assinatura." };
      }
    }
    uploaded = {
      signatureKey: uploads.find((_, index) => record.files[index]?.kind === "SIGNATURE")?.key ?? null,
      photoKeys: uploads.filter((_, index) => record.files[index]?.kind === "PHOTO").map((upload) => upload.key),
    };
    await store.saveQueueRecord({ ...record, uploaded });
  }

  const result = await call<{ orderId: string }>("/api/motorista/entregas", {
    method: "POST",
    body: { ...record.payload, clientRequestId, signatureKey: uploaded?.signatureKey ?? null, photoKeys: uploaded?.photoKeys ?? [] },
  });
  if (result.ok) {
    await store.markSynced(record.orderId);
    return { kind: "enviado" };
  }
  if (result.code === "ARQUIVO") {
    // Um arquivo não está no storage: a próxima tentativa sobe tudo de novo.
    await store.saveQueueRecord({ ...((await store.getQueueRecord(clientRequestId)) ?? record), uploaded: null });
    return { kind: "temporario", message: result.error };
  }
  return failure(result);
}
