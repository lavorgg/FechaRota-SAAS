// "Iniciar rota": muda para EM_ANDAMENTO e devolve o pacote que vai para o IndexedDB.

import { driverApi } from "@/lib/api/driver-api";
import { startDriverRoute } from "@/lib/services/driver-routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: RouteContext<"/api/motorista/rotas/[id]/iniciar">) {
  const { id } = await params;
  return driverApi(request, { label: "motorista-iniciar", mutation: true }, (ctx) => startDriverRoute(ctx, id));
}
