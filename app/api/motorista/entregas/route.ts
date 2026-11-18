// Passo 2c/2d da fila (seção 5.7): grava o comprovante. Reenvio com o mesmo clientRequestId
// devolve o resultado original.

import { driverApi } from "@/lib/api/driver-api";
import { finalizeDelivery } from "@/lib/services/deliveries";
import { finalizeDeliverySchema } from "@/lib/validation/deliveries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return driverApi(request, { label: "motorista-entrega", schema: finalizeDeliverySchema, mutation: true }, (ctx, data) => finalizeDelivery(ctx, data));
}
