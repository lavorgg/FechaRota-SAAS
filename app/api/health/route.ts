// Página de saúde: confere banco e storage. Usada para validar cada deploy (seção 11, Fase 1).

import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await checkHealth();
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
