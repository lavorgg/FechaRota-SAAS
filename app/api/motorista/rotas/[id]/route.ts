// Pacote completo de uma rota, para baixar de novo sem iniciar.

import { driverApi } from "@/lib/api/driver-api";
import { getDriverRouteBundle } from "@/lib/services/driver-routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteContext<"/api/motorista/rotas/[id]">) {
  const { id } = await params;
  return driverApi(request, { label: "motorista-rota", mutation: false }, (ctx) => getDriverRouteBundle(ctx, id));
}
