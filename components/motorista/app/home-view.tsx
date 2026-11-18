"use client";

// Lista: rotas de hoje (seção 5.7). Online, vem do servidor e fica salva; sem sinal, mostra a
// última lista salva. "Iniciar rota" baixa a rota completa para o IndexedDB.

import { TruckIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateString, formatInstant } from "@/domain/dates";
import { ROUTE_STATUS_LABELS } from "@/domain/route-status";
import { fetchToday, startRoute } from "@/lib/driver-app/api";
import type { TodayList } from "@/lib/driver-app/types";
import type { DriverRouteDTO } from "@/lib/services/driver-routes";

import { useDriverApp } from "./context";
import { InstallPrompt } from "./install-prompt";
import { navigate } from "./use-hash-route";

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
/** Fora do componente: o lint de pureza não distingue handler assíncrono de render. */
const stamp = () => Date.now();

export function HomeView() {
  const { user, store } = useDriverApp();
  const [today, setToday] = useState<TodayList | null>(null);
  const [offline, setOffline] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await store.getToday();
      if (active && cached) setToday(cached);
      const response = await fetchToday();
      if (!active) return;
      if (response.ok) {
        const fresh = { date: response.data.date, routes: response.data.routes, fetchedAt: stamp() };
        await store.saveToday(fresh);
        setToday(fresh);
        setOffline(false);
      } else {
        setOffline(true);
        if (!cached) setToday({ date: "", routes: [], fetchedAt: 0 });
      }
      const ids = await Promise.all((response.ok ? response.data.routes : (cached?.routes ?? [])).map(async (route) => ((await store.getRoute(route.id)) ? route.id : null)));
      if (active) setSaved(new Set(ids.filter((id): id is string => id !== null)));
    })();
    return () => {
      active = false;
    };
  }, [store]);

  async function open(route: DriverRouteDTO) {
    if (saved.has(route.id) && route.status !== "LIBERADA_CARGA") {
      navigate({ name: "rota", routeId: route.id });
      return;
    }
    setError(null);
    setBusy(route.id);
    const response = await startRoute(route.id);
    setBusy(null);
    if (!response.ok) {
      setError(response.status === 0 ? "Sem conexão. Para iniciar a rota é preciso internet; depois ela funciona sem sinal." : response.error);
      return;
    }
    await store.saveRoute({ bundle: response.data, savedAt: stamp() });
    navigate({ name: "rota", routeId: route.id });
  }

  const isAdmin = user.role === "ADMIN";
  return (
    <div className="flex flex-col gap-4">
      <InstallPrompt />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Suas rotas de hoje</h1>
        <p className="text-muted-foreground">{today?.date ? formatDateString(today.date) : "Carregando..."}</p>
      </div>
      {offline && today && today.fetchedAt > 0 && (
        <p className="text-base text-muted-foreground">Sem conexão: lista salva às {formatInstant(new Date(today.fetchedAt), deviceTimeZone())}.</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-base">{error}</AlertDescription>
        </Alert>
      )}
      {today && today.routes.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-5">
          <TruckIcon className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">{isAdmin ? "Nenhuma rota liberada hoje." : "Nenhuma rota atribuída a você hoje."}</p>
          <p className="text-muted-foreground">Quando a expedição liberar a {isAdmin ? "rota" : "sua rota"}, ela aparece aqui.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {(today?.routes ?? []).map((route) => {
            const local = saved.has(route.id);
            const action =
              route.status === "LIBERADA_CARGA" ? "Iniciar rota" : route.status === "EM_ANDAMENTO" ? (local ? "Continuar rota" : "Baixar rota") : local ? "Ver paradas" : null;
            return (
              <li key={route.id} className="flex flex-col gap-2 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold">{route.code}</span>
                  <Badge variant="secondary">{ROUTE_STATUS_LABELS[route.status]}</Badge>
                </div>
                <span className="text-base">{route.name}</span>
                <span className="text-base text-muted-foreground">
                  {route.done} de {route.stops} {route.stops === 1 ? "parada" : "paradas"}
                  {route.vehiclePlate ? ` · ${route.vehiclePlate}` : ""}
                  {isAdmin ? ` · ${route.driverName}` : ""}
                </span>
                {action && (
                  <Button className="h-12 text-base" disabled={busy !== null} onClick={() => void open(route)}>
                    {busy === route.id ? "Baixando a rota..." : action}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
