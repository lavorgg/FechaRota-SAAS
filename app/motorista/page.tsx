import { TruckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateString } from "@/domain/dates";
import { ROUTE_STATUS_LABELS } from "@/domain/route-status";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { listDriverRoutesForToday } from "@/lib/services/driver-routes";

export default async function DriverHomePage() {
  const session = await requirePagePermission("entregas.registrar");
  const { date, routes } = await listDriverRoutesForToday(serviceContext(session));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Suas rotas de hoje</h1>
        <p className="text-muted-foreground">{formatDateString(date)}</p>
      </div>

      {routes.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-5">
          <TruckIcon className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">Nenhuma rota atribuída a você hoje.</p>
          <p className="text-muted-foreground">Quando a expedição liberar a sua rota, ela aparece aqui.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {routes.map((route) => (
            <li key={route.id} className="flex flex-col gap-1 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{route.code}</span>
                <Badge variant="secondary">{ROUTE_STATUS_LABELS[route.status]}</Badge>
              </div>
              <span>{route.name}</span>
              <span className="text-muted-foreground">
                {route.stops} {route.stops === 1 ? "parada" : "paradas"}
                {route.vehiclePlate ? ` · ${route.vehiclePlate}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
