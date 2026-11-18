// Passo 2a da fila (seção 5.7): URLs PUT pré-assinadas para fotos e assinatura.

import { driverApi } from "@/lib/api/driver-api";
import { presignProofUploads } from "@/lib/services/deliveries";
import { presignSchema } from "@/lib/validation/deliveries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return driverApi(request, { label: "motorista-presign", schema: presignSchema, mutation: true }, (ctx, data) => presignProofUploads(ctx, data));
}
