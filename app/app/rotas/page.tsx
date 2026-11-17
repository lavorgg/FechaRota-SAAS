import type { Metadata } from "next";

import { RoutePlanner } from "@/components/rotas/route-planner";
import { todayInTimeZone } from "@/domain/dates";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";
import { DATE_PARAM, resolveSelectedDate } from "@/lib/selected-date";
import { getRoutePlanning } from "@/lib/services/routes";

export const metadata: Metadata = { title: "Rotas" };

export default async function RoutesPage({ searchParams }: PageProps<"/app/rotas">) {
  const session = await requirePagePermission("rotas.montar");
  const params = await searchParams;
  const date = resolveSelectedDate(params[DATE_PARAM], session.company.timezone);
  const planning = await getRoutePlanning(serviceContext(session), date);
  const ordersHref = date === todayInTimeZone(session.company.timezone) ? "/app/pedidos" : `/app/pedidos?${DATE_PARAM}=${date}`;
  // A chave reinicia a seleção ao trocar de data.
  return <RoutePlanner key={date} planning={planning} readOnly={!planAllowsWrite(session.company.planStatus)} ordersHref={ordersHref} />;
}
