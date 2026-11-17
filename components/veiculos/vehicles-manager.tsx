"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontalIcon, PlusIcon, TruckIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createVehicleAction, deleteVehicleAction, setVehicleActiveAction, updateVehicleAction } from "@/app/app/veiculos/actions";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { ConfirmDialog } from "@/components/lista/confirm-dialog";
import { EmptyState } from "@/components/lista/empty-state";
import { ListToolbar } from "@/components/lista/list-toolbar";
import { Pagination, listHref } from "@/components/lista/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPlate } from "@/domain/plate";
import type { Page } from "@/lib/services/common";
import type { VehicleDTO } from "@/lib/services/vehicles";
import { type UpdateVehicleData, type UpdateVehicleInput, updateVehicleSchema } from "@/lib/validation/catalog";

type Props = { result: Page<VehicleDTO>; query: string; status: string; readOnly: boolean };

export function VehiclesManager({ result, query, status, readOnly }: Props) {
  const [editing, setEditing] = useState<VehicleDTO | "novo" | null>(null);
  const [deleting, setDeleting] = useState<VehicleDTO | null>(null);
  const [pending, startTransition] = useTransition();

  function setActive(vehicle: VehicleDTO, active: boolean) {
    startTransition(async () => {
      const r = await setVehicleActiveAction({ id: vehicle.id, active });
      if (r.ok) toast.success(active ? "Veículo reativado." : "Veículo inativado.");
      else toast.error(r.error);
    });
  }

  function remove(vehicle: VehicleDTO) {
    startTransition(async () => {
      const r = await deleteVehicleAction({ id: vehicle.id });
      if (r.ok) toast.success("Veículo excluído.");
      else toast.error(r.error);
      setDeleting(null);
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Veículos</h1>
          <p className="text-muted-foreground">
            {result.total} {result.total === 1 ? "veículo" : "veículos"}
          </p>
        </div>
        <Button onClick={() => setEditing("novo")} disabled={readOnly}>
          <PlusIcon aria-hidden />
          Novo veículo
        </Button>
      </div>
      <ListToolbar action="/app/veiculos" query={query} status={status} placeholder="Buscar por placa ou modelo" />

      {result.items.length === 0 ? (
        <EmptyState
          icon={<TruckIcon className="size-6" aria-hidden />}
          title={query ? `Nenhum veículo encontrado para "${query}".` : "Nenhum veículo nesta lista."}
          action={
            <Button onClick={() => setEditing("novo")} disabled={readOnly}>
              Cadastrar veículo
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Capacidade</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((vehicle) => (
                <TableRow key={vehicle.id} className={vehicle.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-medium tabular-nums">{formatPlate(vehicle.plate)}</TableCell>
                  <TableCell>{vehicle.model}</TableCell>
                  <TableCell className="text-right tabular-nums">{vehicle.capacityKg ? `${vehicle.capacityKg.toLocaleString("pt-BR")} kg` : "—"}</TableCell>
                  <TableCell>{vehicle.active ? "Ativo" : "Inativo"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações para ${formatPlate(vehicle.plate)}`} disabled={readOnly || pending}>
                          <MoreHorizontalIcon aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(vehicle)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setActive(vehicle, !vehicle.active)}>{vehicle.active ? "Inativar" : "Reativar"}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(vehicle)}>
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(pagina) => listHref("/app/veiculos", { q: query, situacao: status, pagina })} />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">{editing !== null && <VehicleForm vehicle={editing === "novo" ? null : editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Excluir ${deleting ? formatPlate(deleting.plate) : ""}?`}
        description="Só dá para excluir veículo que nunca foi usado em rota. Se já foi, inative."
        confirmLabel="Excluir"
        pending={pending}
        onConfirm={() => deleting && remove(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  );
}

function VehicleForm({ vehicle, onDone }: { vehicle: VehicleDTO | null; onDone: () => void }) {
  const form = useForm<UpdateVehicleInput, unknown, UpdateVehicleData>({
    resolver: zodResolver(updateVehicleSchema),
    defaultValues: { id: vehicle?.id ?? "novo", plate: vehicle ? formatPlate(vehicle.plate) : "", model: vehicle?.model ?? "", capacityKg: vehicle?.capacityKg ? String(vehicle.capacityKg) : "" },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    startTransition(async () => {
      const { id, ...values } = form.getValues();
      const result = vehicle ? await updateVehicleAction({ id, ...values }) : await createVehicleAction(values);
      if (result.ok) {
        toast.success(vehicle ? "Veículo salvo." : "Veículo cadastrado.");
        onDone();
      } else {
        setServerError(result.error);
        applyServerFieldErrors(form, result);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{vehicle ? "Editar veículo" : "Novo veículo"}</DialogTitle>
        <DialogDescription>A capacidade serve para avisar quando a rota passar do peso.</DialogDescription>
      </DialogHeader>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={Boolean(errors.plate)}>
          <FieldLabel htmlFor="plate">Placa</FieldLabel>
          <Input id="plate" autoFocus placeholder="ABC1D23" className="uppercase" aria-invalid={Boolean(errors.plate)} {...form.register("plate")} />
          <FieldError errors={[errors.plate]} />
        </Field>
        <Field data-invalid={Boolean(errors.model)}>
          <FieldLabel htmlFor="model">Modelo</FieldLabel>
          <Input id="model" placeholder="Hyundai HR baú" aria-invalid={Boolean(errors.model)} {...form.register("model")} />
          <FieldError errors={[errors.model]} />
        </Field>
        <Field data-invalid={Boolean(errors.capacityKg)}>
          <FieldLabel htmlFor="capacityKg">Capacidade em kg (opcional)</FieldLabel>
          <Input id="capacityKg" inputMode="numeric" aria-invalid={Boolean(errors.capacityKg)} {...form.register("capacityKg")} />
          <FieldError errors={[errors.capacityKg]} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
