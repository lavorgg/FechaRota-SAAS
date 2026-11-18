// Quem está usando o app e as rotas de hoje (seção 5.7, "Lista").

import { driverApi } from "@/lib/api/driver-api";
import { getCurrentSession } from "@/lib/auth/current";
import { listDriverRoutesForToday } from "@/lib/services/driver-routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return driverApi(request, { label: "motorista-hoje", mutation: false }, async (ctx) => {
    const session = await getCurrentSession();
    const today = await listDriverRoutesForToday(ctx);
    return { user: { id: ctx.userId, name: session?.user.name ?? "", role: ctx.role }, companyName: session?.company.name ?? "", ...today };
  });
}
