// Tipos do app do motorista no navegador (seção 5.7). Os dados de negócio ficam no IndexedDB,
// nunca no cache do service worker (seção 3.13).

import type { DeliveryOutcome } from "../../domain/delivery";
import type { QueueEntry } from "../../domain/offline-queue";
import type { UserRole } from "../auth/permissions";
import type { DriverRouteBundle, DriverRouteDTO } from "../services/driver-routes";
import type { FinalizeDeliveryInput } from "../validation/deliveries";

export type DriverUser = { id: string; name: string; role: UserRole; companyName: string };

export type TodayList = { date: string; routes: DriverRouteDTO[]; fetchedAt: number };

export type StoredRoute = { bundle: DriverRouteBundle; savedAt: number };

/** Desfecho registrado no celular, antes ou depois de chegar ao servidor. */
export type LocalOutcome = { orderId: string; routeId: string; outcome: DeliveryOutcome; clientRequestId: string; confirmedAt: number; synced: boolean };

export type QueueFile = { kind: "PHOTO" | "SIGNATURE"; contentType: "image/jpeg" | "image/png"; blob: Blob };

export type QueuePayload = Omit<FinalizeDeliveryInput, "signatureKey" | "photoKeys">;

/** Item da fila: estado de envio + dados do formulário + arquivos já comprimidos. */
export type QueueRecord = QueueEntry & {
  label: string;
  payload: QueuePayload;
  files: QueueFile[];
  /** Chaves no storage depois que os arquivos subiram (não sobe de novo numa nova tentativa). */
  uploaded: { signatureKey: string | null; photoKeys: string[] } | null;
};
