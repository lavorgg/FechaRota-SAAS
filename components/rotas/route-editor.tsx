"use client";

// Tela /app/rotas/[id] (seção 5.6): paradas, ordem, Google Maps, liberação, reabertura,
// exclusão do rascunho e impressão dos romaneios.
//
// A página monta este componente com `key` = versão da rota: depois de cada gravação a página
// é revalidada, chega a versão nova e o estado local (ordem otimista, diálogos) recomeça limpo.

import { ArrowLeftIcon, CalculatorIcon, ListOrderedIcon, LockOpenIcon, MapIcon, PencilIcon, PrinterIcon, SendIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addOrdersToRouteAction,
  deleteRouteAction,
  releaseRouteAction,
  removeOrderFromRouteAction,
  reopenRouteAction,
  reorderRouteStopsAction,
  updateRouteAction,
} from "@/app/app/rotas/actions";
import { ConfirmDialog } from "@/components/lista/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DAY_OF_WEEK_LABELS, dayOfWeekOfDateString, formatDateString } from "@/domain/dates";
import { suggestStopOrder } from "@/domain/route-planning";
import { isRouteCompositionEditable, isRoutePrintable } from "@/domain/route-status";
import type { ActionResult } from "@/lib/actions/result";
import type { RouteDetailDTO, RouteStopDTO, SavedRoute } from "@/lib/services/routes";

import { CapacityWarning, LoadFigures, loadSummaryText } from "./load-summary";
import { OrderPicker } from "./order-picker";
import { RouteStatusBadge } from "./route-status-badge";
import { DriverSelect, VehicleSelect } from "./route-selects";
import { StopList } from "./stop-list";

type Props = { route: RouteDetailDTO; canReopen: boolean; canEditCompany: boolean; readOnly: boolean };

export function RouteEditor({ route, canReopen, canEditCompany, readOnly }: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(() => route.stops.map((stop) => stop.id));
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"editar" | "liberar" | "excluir" | "reabrir" | null>(null);
  const [pending, startTransition] = useTransition();
  const editable = isRouteCompositionEditable(route.status) && !readOnly;
  const printable = isRoutePrintable(route.status);
  const ref = { id: route.id, version: route.version };
  const listHref = `/app/rotas?data=${route.deliveryDate}`;

  const byId = new Map(route.stops.map((stop) => [stop.id, stop]));
  const stops = order.map((id) => byId.get(id)).filter((stop): stop is RouteStopDTO => stop !== undefined);

  /** Roda a action; em erro, avisa e volta a ordem da tela para a que está gravada. */
  function run(action: () => Promise<ActionResult<unknown>>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
      } else {
        toast.error(result.error);
        setOrder(route.stops.map((stop) => stop.id));
        router.refresh();
      }
    });
  }

  function reorder(ids: string[]) {
    setOrder(ids);
    run(() => reorderRouteStopsAction({ ...ref, orderIds: ids }), "Ordem das paradas salva.");
  }

  function applySuggested() {
    reorder(suggestStopOrder(route.stops).map((stop) => stop.id));
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href={listHref} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden />
          Rotas do dia
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {route.code} · {route.name} <RouteStatusBadge status={route.status} />
            </h1>
            <p className="text-muted-foreground">
              {DAY_OF_WEEK_LABELS[dayOfWeekOfDateString(route.deliveryDate)]}, {formatDateString(route.deliveryDate)} · Motorista {route.driver.name} ·{" "}
              {route.vehicle ? `${route.vehicle.plate} (${route.vehicle.model})` : "sem veículo definido"} · versão {route.version}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {printable && (
              <>
                <Button asChild variant="outline">
                  <Link href={`/app/rotas/${route.id}/romaneio-carga`}>
                    <PrinterIcon aria-hidden />
                    Romaneio de carga
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/app/rotas/${route.id}/romaneio-entrega`}>
                    <PrinterIcon aria-hidden />
                    Romaneio de entrega
                  </Link>
                </Button>
              </>
            )}
            {(route.status === "EM_ANDAMENTO" || route.status === "AGUARDANDO_ACERTO" || route.status === "CONCLUIDA") && (
              <Button asChild>
                <Link href={`/app/rotas/${route.id}/fechamento`}>
                  <CalculatorIcon aria-hidden />
                  Fechamento
                </Link>
              </Button>
            )}
            {route.status === "LIBERADA_CARGA" && canReopen && (
              <Button variant="outline" onClick={() => setDialog("reabrir")} disabled={readOnly || pending}>
                <LockOpenIcon aria-hidden />
                Reabrir rota
              </Button>
            )}
            {editable && (
              <>
                <Button variant="outline" onClick={() => setDialog("editar")} disabled={pending}>
                  <PencilIcon aria-hidden />
                  Editar dados
                </Button>
                <Button variant="outline" onClick={() => setDialog("excluir")} disabled={pending}>
                  <Trash2Icon aria-hidden />
                  Excluir rascunho
                </Button>
                <Button onClick={() => setDialog("liberar")} disabled={pending || stops.length === 0}>
                  <SendIcon aria-hidden />
                  Liberar para carga
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {route.status === "RASCUNHO" && !route.driver.active && (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>O motorista desta rota está inativo. Troque o motorista em &quot;Editar dados&quot; antes de liberar.</AlertDescription>
        </Alert>
      )}
      {route.status === "RASCUNHO" && route.vehicle && !route.vehicle.active && (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>O veículo desta rota está inativo. Troque o veículo em &quot;Editar dados&quot; antes de liberar.</AlertDescription>
        </Alert>
      )}
      {route.status === "LIBERADA_CARGA" && (
        <Alert>
          <AlertDescription>
            Rota liberada para carga: a composição está congelada e os romaneios podem ser impressos.
            {canReopen ? " Para mudar algo, reabra a rota." : " Para mudar algo, um administrador precisa reabrir a rota."}
          </AlertDescription>
        </Alert>
      )}

      <LoadFigures load={route.load} capacityKg={route.vehicle?.capacityKg} />
      <CapacityWarning load={route.load} capacityKg={route.vehicle?.capacityKg} />

      {route.mapsSegments.length > 0 && (
        <section aria-labelledby="maps-title" className="flex flex-col gap-2">
          <h2 id="maps-title" className="font-semibold">
            Google Maps
          </h2>
          <div className="flex flex-wrap gap-2">
            {route.mapsSegments.map((segment, index) => (
              <Button key={segment.url} asChild variant="outline">
                <a href={segment.url} target="_blank" rel="noopener noreferrer">
                  <MapIcon aria-hidden />
                  {route.mapsSegments.length === 1 ? "Abrir rota no Google Maps" : `Trecho ${index + 1}: paradas ${segment.fromStop} a ${segment.toStop}`}
                </a>
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {route.mapsSegments.length > 1 && "O link do Maps aceita poucas paradas, então a rota foi dividida em trechos. "}
            {route.hasDepot ? (
              "Partida: endereço do depósito."
            ) : (
              <>
                Sem endereço do depósito, o Maps parte da localização do aparelho.{" "}
                {canEditCompany && (
                  <Link href="/app/empresa" className="underline underline-offset-4">
                    Cadastrar o depósito
                  </Link>
                )}
              </>
            )}
          </p>
        </section>
      )}

      <section aria-labelledby="stops-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 id="stops-title" className="font-semibold">
              Paradas ({stops.length})
            </h2>
            {editable && (
              <p className="text-sm text-muted-foreground">
                A ordem inicial é por bairro, rua e número: uma ordenação simples, não uma otimização de trajeto. Arraste ou use as setas para ajustar.
              </p>
            )}
          </div>
          {editable && stops.length > 1 && (
            <Button variant="outline" size="sm" onClick={applySuggested} disabled={pending}>
              <ListOrderedIcon aria-hidden />
              Ordenar por bairro, rua e número
            </Button>
          )}
        </div>
        {stops.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Rota sem paradas. Adicione pedidos abaixo ou exclua o rascunho.</p>
        ) : (
          <StopList
            stops={stops}
            editable={editable}
            disabled={pending}
            onReorder={reorder}
            onRemove={(stop) => run(() => removeOrderFromRouteAction({ ...ref, orderId: stop.id }), `Pedido nº ${stop.orderNumber} voltou para "sem rota".`)}
          />
        )}
      </section>

      {editable && (
        <section aria-labelledby="add-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 id="add-title" className="font-semibold">
                Adicionar pedidos do dia
              </h2>
              <p className="text-sm text-muted-foreground">Pedidos pendentes de {formatDateString(route.deliveryDate)} que ainda não estão em nenhuma rota. Entram no fim da lista.</p>
            </div>
            {toAdd.size > 0 && (
              <Button
                onClick={() => run(() => addOrdersToRouteAction({ ...ref, orderIds: [...toAdd] }), toAdd.size === 1 ? "Pedido adicionado à rota." : `${toAdd.size} pedidos adicionados à rota.`)}
                disabled={pending}
              >
                Adicionar {toAdd.size} {toAdd.size === 1 ? "pedido" : "pedidos"}
              </Button>
            )}
          </div>
          {route.available.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Nenhum outro pedido pendente sem rota neste dia.</p>
          ) : (
            <OrderPicker groups={route.available} selected={toAdd} onChange={setToAdd} disabled={pending} />
          )}
        </section>
      )}

      <Dialog open={dialog === "editar"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">{dialog === "editar" && <EditRouteForm route={route} onDone={() => setDialog(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={dialog === "reabrir"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">{dialog === "reabrir" && <ReopenForm route={route} onDone={() => setDialog(null)} />}</DialogContent>
      </Dialog>
      <ConfirmDialog
        open={dialog === "liberar"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Liberar ${route.code} para carga?`}
        description={`${loadSummaryText(route.load)}. Os pedidos passam para "Em rota", a composição fica congelada e os romaneios podem ser impressos. Depois disso, só um administrador reabre a rota.`}
        confirmLabel="Liberar para carga"
        pending={pending}
        onConfirm={() => run(() => releaseRouteAction(ref), `Rota ${route.code} liberada para carga.`, () => setDialog(null))}
      />
      <ConfirmDialog
        open={dialog === "excluir"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Excluir o rascunho ${route.code}?`}
        description={`Os ${stops.length} pedidos voltam para "sem rota". O código ${route.code} não será usado de novo.`}
        confirmLabel="Excluir rascunho"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteRouteAction(ref);
            if (result.ok) {
              toast.success(`Rascunho ${route.code} excluído.`);
              router.push(listHref);
            } else {
              toast.error(result.error);
              setDialog(null);
            }
          })
        }
      />
    </>
  );
}

function EditRouteForm({ route, onDone }: { route: RouteDetailDTO; onDone: () => void }) {
  const [name, setName] = useState(route.name);
  const [driverId, setDriverId] = useState(route.driver.active ? route.driver.id : "");
  const [vehicleId, setVehicleId] = useState<string | null>(route.vehicle?.active ? route.vehicle.id : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result: ActionResult<SavedRoute> = await updateRouteAction({ id: route.id, version: route.version, name, driverId, vehicleId });
          if (result.ok) {
            toast.success("Dados da rota salvos.");
            onDone();
          } else {
            setServerError(result.error);
            setErrors(result.fieldErrors ?? {});
          }
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Dados da rota {route.code}</DialogTitle>
        <DialogDescription>Nome, motorista e veículo. Só dá para mudar enquanto a rota está em rascunho.</DialogDescription>
      </DialogHeader>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="edit-route-name">Nome da rota</FieldLabel>
        <Input id="edit-route-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(errors.name)} />
        <FieldError>{errors.name}</FieldError>
      </Field>
      <DriverSelect id="edit-route-driver" drivers={route.drivers} value={driverId} onChange={setDriverId} error={errors.driverId} />
      <VehicleSelect id="edit-route-vehicle" vehicles={route.vehicles} value={vehicleId} onChange={setVehicleId} error={errors.vehicleId} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ReopenForm({ route, onDone }: { route: RouteDetailDTO; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await reopenRouteAction({ id: route.id, version: route.version, reason });
          if (result.ok) {
            toast.success(`Rota ${route.code} reaberta.`);
            onDone();
          } else setError(result.fieldErrors?.reason ?? result.error);
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Reabrir a rota {route.code}?</DialogTitle>
        <DialogDescription>
          A rota volta para rascunho e os pedidos voltam para pendente. Os romaneios já impressos deixam de valer: imprima de novo depois de liberar.
        </DialogDescription>
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="reopen-reason">Motivo (opcional)</FieldLabel>
        <Textarea id="reopen-reason" rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
        <FieldDescription>Fica registrado na auditoria.</FieldDescription>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Reabrindo..." : "Reabrir rota"}
        </Button>
      </DialogFooter>
    </form>
  );
}
