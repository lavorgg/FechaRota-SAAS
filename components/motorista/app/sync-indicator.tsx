"use client";

// Indicador sempre visível da fila (seção 5.7, passo 4).

import { CloudOffIcon, CloudUploadIcon, CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import { formatInstant } from "@/domain/dates";
import { cn } from "@/lib/utils";

import { useSyncState } from "./context";
import { hrefFor } from "./use-hash-route";

export function syncSummary(state: { pending: number; attention: number }): string {
  if (state.pending === 0 && state.attention === 0) return "Tudo sincronizado";
  const parts = [];
  if (state.pending > 0) parts.push(`${state.pending} ${state.pending === 1 ? "entrega aguardando envio" : "entregas aguardando envio"}`);
  if (state.attention > 0) parts.push(`${state.attention} ${state.attention === 1 ? "precisa" : "precisam"} de atenção`);
  return parts.join(" · ");
}

export function SyncIndicator({ timeZone }: { timeZone: string }) {
  const state = useSyncState();
  const ok = state.pending === 0 && state.attention === 0;
  const Icon = state.attention > 0 ? CircleAlertIcon : !state.online ? CloudOffIcon : ok ? CircleCheckIcon : CloudUploadIcon;
  return (
    <a
      href={hrefFor({ name: "fila" })}
      data-testid="indicador-sincronizacao"
      className={cn(
        "flex min-h-12 items-center gap-3 border-b px-4 py-2 text-base",
        state.attention > 0 ? "bg-red-50 text-red-950" : ok ? "bg-background" : "bg-amber-50 text-amber-950",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-medium" role="status" aria-live="polite">
          {state.running ? "Enviando entregas..." : syncSummary(state)}
        </span>
        <span className="text-sm opacity-80">
          {!state.online ? "Sem conexão · " : ""}
          {state.sessionExpired ? "Entre de novo para enviar · " : ""}
          {state.lastSyncAt ? `Última sincronização: ${formatInstant(new Date(state.lastSyncAt), timeZone)}` : "Nenhuma sincronização ainda"}
        </span>
      </span>
    </a>
  );
}
