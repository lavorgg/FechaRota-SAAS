"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RouteDriverOption, RouteVehicleOption } from "@/lib/services/routes";

const NO_VEHICLE = "sem-veiculo";

export function DriverSelect({ id, drivers, value, onChange, error }: { id: string; drivers: RouteDriverOption[]; value: string; onChange: (id: string) => void; error?: string }) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>Motorista</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue placeholder="Escolha o motorista" />
        </SelectTrigger>
        <SelectContent>
          {drivers.map((driver) => (
            <SelectItem key={driver.id} value={driver.id}>
              {driver.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {drivers.length === 0 && <FieldDescription>Nenhum motorista ativo. Um administrador cadastra motoristas em Usuários.</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function VehicleSelect({
  id,
  vehicles,
  value,
  onChange,
  error,
}: {
  id: string;
  vehicles: RouteVehicleOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  error?: string;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>Veículo</FieldLabel>
      <Select value={value ?? NO_VEHICLE} onValueChange={(next) => onChange(next === NO_VEHICLE ? null : next)}>
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_VEHICLE}>Sem veículo definido</SelectItem>
          {vehicles.map((vehicle) => (
            <SelectItem key={vehicle.id} value={vehicle.id}>
              {vehicle.plate} · {vehicle.model}
              {vehicle.capacityKg ? ` (${vehicle.capacityKg.toLocaleString("pt-BR")} kg)` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
