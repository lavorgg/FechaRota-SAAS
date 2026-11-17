"use client";

// Tela /app/rotas (seção 5.6): agrupador à esquerda, nova rota e rotas do dia à direita.

import { ClipboardListIcon, RouteIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { createRouteAction } from "@/app/app/rotas/actions";
import { EmptyState } from "@/components/lista/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DAY_OF_WEEK_LABELS, dayOfWeekOfDateString, formatDateString } from "@/domain/dates";
import { suggestRouteName, summarizeLoad } from "@/domain/route-planning";
import type { RoutePlanningDTO } from "@/lib/services/routes";

import { CapacityWarning, loadSummaryText } from "./load-summary";
import { OrderPicker } from "./order-picker";
import { RouteStatusBadge } from "./route-status-badge";
import { DriverSelect, VehicleSelect } from "./route-selects";

export function RoutePlanner({ planning, readOnly, ordersHref }: { planning: RoutePlanningDTO; readOnly: boolean; ordersHref: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [driverId, setDriverId] = useState(planning.drivers.length === 1 ? (planning.drivers[0]?.id ?? "") : "");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allOrders = useMemo(() => planning.groups.flatMap((city) => city.neighborhoods.flatMap((group) => group.orders)), [planning.groups]);
  const chosen = allOrders.filter((order) => selected.has(order.id));
  const load = summarizeLoad(chosen);
  const vehicle = planning.vehicles.find((option) => option.id === vehicleId) ?? null;

  // Nome sugerido: os bairros selecionados, até o usuário digitar o próprio.
  const suggestedName = suggestRouteName(chosen);
  const routeName = nameEdited ? name : suggestedName;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setServerError(null);
    startTransition(async () => {
      const result = await createRouteAction({ deliveryDate: planning.date, name: routeName, driverId, vehicleId, orderIds: chosen.map((order) => order.id) });
      if (result.ok) {
        toast.success(`Rota ${result.data.code} criada.`);
        router.push(`/app/rotas/${result.data.id}`);
      } else {
        setServerError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rotas</h1>
        <p className="text-muted-foreground">
          {DAY_OF_WEEK_LABELS[dayOfWeekOfDateString(planning.date)]}, {formatDateString(planning.date)} · {allOrders.length}{" "}
          {allOrders.length === 1 ? "pedido pendente sem rota" : "pedidos pendentes sem rota"}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          {allOrders.length === 0 ? (
            <EmptyState
              icon={<ClipboardListIcon className="size-6" aria-hidden />}
              title={`Nenhum pedido pendente sem rota para ${formatDateString(planning.date)}.`}
              description="Lance os pedidos do dia ou gere os recorrentes na tela de pedidos."
              action={
                <Button asChild variant="outline">
                  <Link href={ordersHref}>Ir para pedidos</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Marque o bairro inteiro ou abra o bairro para escolher pedido a pedido.</p>
                {selected.size > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                    Limpar seleção
                  </Button>
                )}
              </div>
              <OrderPicker groups={planning.groups} selected={selected} onChange={setSelected} disabled={readOnly} />
            </>
          )}
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-20">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-xl border p-4" aria-label="Nova rota">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">Nova rota</h2>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {chosen.length === 0 ? "Nenhum pedido selecionado." : loadSummaryText(load)}
              </p>
            </div>
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
            <fieldset disabled={readOnly || pending} className="flex flex-col gap-4">
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="route-name">Nome da rota</FieldLabel>
                <Input
                  id="route-name"
                  value={routeName}
                  maxLength={80}
                  placeholder="Ex.: Centro manhã"
                  aria-invalid={Boolean(errors.name)}
                  onChange={(event) => {
                    setNameEdited(true);
                    setName(event.target.value);
                  }}
                />
                <FieldError>{errors.name}</FieldError>
              </Field>
              <DriverSelect id="route-driver" drivers={planning.drivers} value={driverId} onChange={setDriverId} error={errors.driverId} />
              <VehicleSelect id="route-vehicle" vehicles={planning.vehicles} value={vehicleId} onChange={setVehicleId} error={errors.vehicleId} />
              <CapacityWarning load={load} capacityKg={vehicle?.capacityKg} />
              {errors.orderIds && <FieldError>{errors.orderIds}</FieldError>}
              <Button type="submit" disabled={chosen.length === 0 || readOnly || pending}>
                {pending ? "Criando..." : chosen.length === 0 ? "Selecione pedidos" : `Criar rota com ${chosen.length} ${chosen.length === 1 ? "pedido" : "pedidos"}`}
              </Button>
              <FieldDescription>A ordem das paradas é sugerida por bairro, rua e número e pode ser ajustada depois.</FieldDescription>
            </fieldset>
          </form>

          <section aria-label="Rotas do dia" className="flex flex-col gap-2">
            <h2 className="font-semibold">Rotas do dia</h2>
            {planning.routes.length === 0 ? (
              <EmptyState icon={<RouteIcon className="size-6" aria-hidden />} title="Nenhuma rota neste dia." description="Selecione pedidos ao lado e crie a primeira rota." />
            ) : (
              <ul className="flex flex-col gap-2">
                {planning.routes.map((route) => (
                  <li key={route.id}>
                    <Link href={`/app/rotas/${route.id}`} className="flex flex-col gap-1 rounded-xl border p-3 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {route.code} · {route.name}
                        </span>
                        <RouteStatusBadge status={route.status} />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {route.driverName}
                        {route.vehiclePlate ? ` · ${route.vehiclePlate}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{loadSummaryText(route)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
