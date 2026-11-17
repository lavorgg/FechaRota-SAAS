import type { Metadata } from "next";

import { OrdersManager } from "@/components/pedidos/orders-manager";
import { addDays, todayInTimeZone } from "@/domain/dates";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";
import { resolveSelectedDate } from "@/lib/selected-date";
import { listOrderProducts, listOrders } from "@/lib/services/orders";
import { listOrdersSchema } from "@/lib/validation/orders";

export const metadata: Metadata = { title: "Pedidos" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function OrdersPage({ searchParams }: PageProps<"/app/pedidos">) {
  const session = await requirePagePermission("pedidos.gerenciar");
  const ctx = serviceContext(session);
  const params = await searchParams;
  const date = resolveSelectedDate(params.data, session.company.timezone);
  const filters = listOrdersSchema.parse({
    status: first(params.situacao),
    bairro: first(params.bairro),
    cliente: first(params.cliente),
    rota: first(params.rota),
    page: first(params.pagina),
  });
  const [result, catalog] = await Promise.all([listOrders(ctx, date, filters), listOrderProducts(ctx)]);
  const today = todayInTimeZone(session.company.timezone);

  return (
    <OrdersManager
      date={date}
      today={today}
      tomorrow={addDays(today, 1)}
      filters={filters}
      result={result}
      catalog={catalog}
      readOnly={!planAllowsWrite(session.company.planStatus)}
    />
  );
}
