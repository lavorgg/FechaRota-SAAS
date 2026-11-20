// Cron diário de retenção (seção 6). A Vercel chama com "Authorization: Bearer ${CRON_SECRET}";
// qualquer outra chamada recebe 401 sem rodar nada.

import { timingSafeEqual } from "node:crypto";

import { describeErrorForLog } from "@/lib/actions/errors";
import { env } from "@/lib/env";
import { runRetention } from "@/lib/services/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorized(request)) return Response.json({ ok: false, error: "Não autorizado." }, { status: 401, headers });
  try {
    const report = await runRetention();
    return Response.json({ ok: true, ...report }, { headers });
  } catch (error) {
    console.error(`[cron:retencao] falhou: ${describeErrorForLog(error)}`);
    return Response.json({ ok: false, error: "A retenção falhou. A próxima rodada tenta de novo." }, { status: 500, headers });
  }
}
