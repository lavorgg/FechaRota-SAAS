"use client";

// Rota em andamento: parada atual (ou a escolhida) e a lista de paradas com a situação de
// cada uma. Lê só do IndexedDB.

import { ArrowLeftIcon, CheckIcon, ClockIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DELIVERY_OUTCOME_LABELS, type DeliveryOutcome } from "@/domain/delivery";
import { ORDER_STATUS_LABELS } from "@/domain/order-status";
import { ROUTE_STATUS_LABELS } from "@/domain/route-status";
import { fetchRoute } from "@/lib/driver-app/api";
import type { LocalOutcome, QueueRecord, StoredRoute } from "@/lib/driver-app/types";
import { cn } from "@/lib/utils";

import { useDriverApp, useSyncState } from "./context";
import { DeliveryForm } from "./delivery-form";
import { StopCard } from "./stop-card";
import { hrefFor, navigate } from "./use-hash-route";

type StopState = { label: string; done: boolean; tone: "aberta" | "enviada" | "aguardando" | "atencao" };

function stopState(serverStatus: string, local: LocalOutcome | undefined, queued: QueueRecord | undefined): StopState {
  if (queued?.status === "atencao") return { label: "Precisa de atenção", done: true, tone: "atencao" };
  if (local && !local.synced) return { label: `${DELIVERY_OUTCOME_LABELS[local.outcome]} · aguardando envio`, done: true, tone: "aguardando" };
  if (local) return { label: `${DELIVERY_OUTCOME_LABELS[local.outcome]} · enviada`, done: true, tone: "enviada" };
  if (serverStatus !== "EM_ROTA") return { label: ORDER_STATUS_LABELS[serverStatus as DeliveryOutcome] ?? serverStatus, done: true, tone: "enviada" };
  return { label: "A entregar", done: false, tone: "aberta" };
}

export function RouteView({ routeId, orderId, finishing }: { routeId: string; orderId: string | null; finishing: boolean }) {
  const { store } = useDriverApp();
  const sync = useSyncState();
  const [stored, setStored] = useState<StoredRoute | null | undefined>(undefined);
  const [progress, setProgress] = useState<Map<string, LocalOutcome>>(new Map());
  const [queue, setQueue] = useState<Map<string, QueueRecord>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  const read = useCallback(() => Promise.all([store.getRoute(routeId), store.progressForRoute(routeId), store.listQueue()]), [store, routeId]);
  const apply = useCallback(([route, local, records]: Awaited<ReturnType<typeof read>>) => {
    setStored(route ?? null);
    setProgress(new Map(local.map((item) => [item.orderId, item])));
    setQueue(new Map(records.map((record) => [record.orderId, record])));
  }, []);
  const load = useCallback(async () => apply(await read()), [apply, read]);

  // Recarrega ao abrir, ao trocar de parada e quando a fila muda (envio concluído).
  useEffect(() => {
    let active = true;
    void read().then((data) => {
      if (active) apply(data);
    });
    return () => {
      active = false;
    };
  }, [read, apply, orderId, finishing, sync.pending, sync.attention]);

  async function refresh() {
    setRefreshing(true);
    const response = await fetchRoute(routeId);
    setRefreshing(false);
    if (!response.ok) {
      toast.error(response.status === 0 ? "Sem conexão. A rota continua salva no celular." : response.error);
      return;
    }
    await store.saveRoute({ bundle: response.data, savedAt: Date.now() });
    await load();
    toast.success("Rota atualizada.");
  }

  if (stored === undefined) return <p className="text-muted-foreground">Carregando rota...</p>;
  if (stored === null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base">Esta rota não está salva neste celular.</p>
        <Button asChild variant="outline" className="h-12 self-start">
          <a href={hrefFor({ name: "inicio" })}>Voltar para as rotas de hoje</a>
        </Button>
      </div>
    );
  }

  const { bundle } = stored;
  const stops = bundle.stops;
  const states = new Map(stops.map((stop) => [stop.orderId, stopState(stop.status, progress.get(stop.orderId), queue.get(stop.orderId))]));
  const next = stops.find((stop) => !states.get(stop.orderId)?.done) ?? null;
  const selected = orderId ? (stops.find((stop) => stop.orderId === orderId) ?? null) : next;
  const doneCount = stops.filter((stop) => states.get(stop.orderId)?.done).length;

  if (finishing && selected) {
    const state = states.get(selected.orderId);
    if (state?.done) {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-base">Esta parada já foi registrada ({state.label}).</p>
          <Button asChild variant="outline" className="h-12 self-start">
            <a href={hrefFor({ name: "rota", routeId })}>Voltar para a rota</a>
          </Button>
        </div>
      );
    }
    return (
      <DeliveryForm
        bundle={bundle}
        stop={selected}
        onDone={() => {
          // A próxima parada aparece na hora, sem esperar a rede.
          navigate({ name: "rota", routeId }, { replace: true });
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <a href={hrefFor({ name: "inicio" })} className="inline-flex min-h-12 items-center gap-1 text-base text-muted-foreground">
            <ArrowLeftIcon className="size-5" aria-hidden />
            Rotas de hoje
          </a>
          <p className="text-xl font-semibold">
            {bundle.route.code} · {bundle.route.name}
          </p>
          <p className="text-base text-muted-foreground">
            {ROUTE_STATUS_LABELS[bundle.route.status]} · {doneCount} de {stops.length} paradas registradas
          </p>
        </div>
        <Button variant="outline" className="size-12 shrink-0" aria-label="Atualizar rota" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCwIcon className={cn(refreshing && "animate-spin")} aria-hidden />
        </Button>
      </div>

      {selected ? (
        <>
          <StopCard stop={selected} total={stops.length} companyName={bundle.company.name} />
          {!states.get(selected.orderId)?.done && bundle.route.status === "EM_ANDAMENTO" && (
            <div className="sticky bottom-0 -mx-4 border-t bg-background px-4 py-3">
              <Button asChild className="h-14 w-full text-lg">
                <a href={hrefFor({ name: "entrega", routeId, orderId: selected.orderId })}>Finalizar entrega</a>
              </Button>
            </div>
          )}
          {states.get(selected.orderId)?.done && <p className="rounded-xl border p-3 text-base">Parada registrada: {states.get(selected.orderId)?.label}.</p>}
        </>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border-2 border-green-700 p-4 text-lg font-semibold">
          <CheckIcon className="size-6" aria-hidden />
          Todas as paradas foram registradas.
        </p>
      )}

      <section aria-labelledby="paradas" className="flex flex-col gap-2">
        <h2 id="paradas" className="text-lg font-semibold">
          Paradas
        </h2>
        <ol className="flex flex-col gap-2">
          {stops.map((stop) => {
            const state = states.get(stop.orderId);
            const Icon = state?.tone === "atencao" ? TriangleAlertIcon : state?.tone === "aguardando" ? ClockIcon : state?.done ? CheckIcon : null;
            return (
              <li key={stop.orderId}>
                <a
                  href={hrefFor({ name: "parada", routeId, orderId: stop.orderId })}
                  aria-current={selected?.orderId === stop.orderId ? "step" : undefined}
                  className={cn("flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-base", selected?.orderId === stop.orderId && "border-2 border-foreground")}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-foreground font-semibold tabular-nums">{stop.stopSequence}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{stop.customerName}</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      {Icon && <Icon className="size-4" aria-hidden />}
                      {state?.label}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
