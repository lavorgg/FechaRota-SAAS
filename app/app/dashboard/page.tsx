import { AlertTriangleIcon, CalendarClockIcon, PackageXIcon, RouteIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DAY_OF_WEEK_LABELS, dayOfWeekOfDateString, formatDateString } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/domain/order-status";
import { ROUTE_STATUSES, ROUTE_STATUS_LABELS } from "@/domain/route-status";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { resolveSelectedDate } from "@/lib/selected-date";
import { getDashboard } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}

function CountList({ title, entries }: { title: string; entries: Array<{ label: string; count: number }> }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
          {entries.map((entry) => (
            <div key={entry.label} className="contents">
              <dt className={entry.count === 0 ? "text-muted-foreground" : undefined}>{entry.label}</dt>
              <dd className="text-right font-medium tabular-nums">{entry.count}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function AlertItem({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children?: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border p-3">
      <span className="mt-0.5 text-amber-600">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">
          {title} <Badge variant="secondary" className="ml-1 tabular-nums">{count}</Badge>
        </p>
        {children}
      </div>
    </li>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/app/dashboard">) {
  const session = await requirePagePermission("painel.acessar");
  const { data } = await searchParams;
  const date = resolveSelectedDate(data, session.company.timezone);
  const { summary, alerts } = await getDashboard(serviceContext(session), date);
  const weekday = DAY_OF_WEEK_LABELS[dayOfWeekOfDateString(date)];

  const hasAlerts =
    alerts.templatesNotGenerated.length > 0 ||
    alerts.notDeliveredWithoutReschedule.total > 0 ||
    summary.pendingWithoutRoute > 0 ||
    alerts.overdueSettlements.length > 0;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {weekday}, {formatDateString(date)}
        </p>
      </div>

      <section aria-label="Indicadores do dia" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pedidos do dia" value={String(summary.orders.total)} hint={`${summary.orders.byStatus.CANCELADO} cancelado(s)`} />
        <Stat label="A receber na entrega" value={formatCents(summary.money.toCollectCents)} hint="Pix e dinheiro; boleto e faturado não entram" />
        <Stat
          label="Recebido (dinheiro + Pix conferido)"
          value={formatCents(summary.money.receivedCents)}
          hint={`Dinheiro ${formatCents(summary.money.receivedCashCents)} · Pix ${formatCents(summary.money.receivedPixCents)}`}
        />
        <Stat label="Pix a conferir" value={formatCents(summary.money.pixToConfirmCents)} hint="Só conta como recebido depois de conferido no extrato" />
      </section>

      <section aria-label="Entregas, pedidos e rotas" className="grid gap-4 lg:grid-cols-3">
        <CountList
          title="Entregas"
          entries={[
            { label: "Concluídas", count: summary.deliveries.completed },
            { label: "Pendentes", count: summary.deliveries.pending },
            { label: "Não entregues", count: summary.deliveries.notDelivered },
          ]}
        />
        <CountList title="Pedidos por situação" entries={ORDER_STATUSES.map((status) => ({ label: ORDER_STATUS_LABELS[status], count: summary.orders.byStatus[status] }))} />
        <CountList
          title={`Rotas (${summary.routes.total})`}
          entries={ROUTE_STATUSES.map((status) => ({ label: ROUTE_STATUS_LABELS[status], count: summary.routes.byStatus[status] }))}
        />
      </section>

      <section aria-labelledby="alertas" className="flex flex-col gap-3">
        <h2 id="alertas" className="text-lg font-semibold">
          Alertas
        </h2>
        {!hasAlerts ? (
          <p className="text-muted-foreground">Nenhum alerta para esta data.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.templatesNotGenerated.length > 0 && (
              <AlertItem icon={<CalendarClockIcon className="size-5" aria-hidden />} title={`Pedidos recorrentes de ${weekday.toLowerCase()} ainda não gerados`} count={alerts.templatesNotGenerated.length}>
                <p className="text-sm text-muted-foreground">{alerts.templatesNotGenerated.map((t) => t.customerName).join(", ")}</p>
              </AlertItem>
            )}
            {summary.pendingWithoutRoute > 0 && (
              <AlertItem icon={<RouteIcon className="size-5" aria-hidden />} title="Pedidos pendentes desta data sem rota" count={summary.pendingWithoutRoute} />
            )}
            {alerts.notDeliveredWithoutReschedule.total > 0 && (
              <AlertItem icon={<PackageXIcon className="size-5" aria-hidden />} title="Pedidos não entregues sem reagendamento" count={alerts.notDeliveredWithoutReschedule.total}>
                <ul className="text-sm text-muted-foreground">
                  {alerts.notDeliveredWithoutReschedule.items.map((item) => (
                    <li key={item.orderNumber}>
                      Pedido nº {item.orderNumber} · {item.customerName} · {formatDateString(item.deliveryDate)}
                    </li>
                  ))}
                </ul>
              </AlertItem>
            )}
            {alerts.overdueSettlements.length > 0 && (
              <AlertItem icon={<AlertTriangleIcon className="size-5" aria-hidden />} title="Rotas aguardando acerto há mais de 12 horas" count={alerts.overdueSettlements.length}>
                <ul className="text-sm text-muted-foreground">
                  {alerts.overdueSettlements.map((route) => (
                    <li key={route.code}>
                      {route.code} · {route.name} · {formatDateString(route.deliveryDate)}
                    </li>
                  ))}
                </ul>
              </AlertItem>
            )}
          </ul>
        )}
      </section>
    </>
  );
}
