import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatWeightKg } from "@/domain/cargo-manifest";
import { formatCents } from "@/domain/money";
import { type LoadSummary, exceedsCapacity } from "@/domain/route-planning";

/** "3 pedidos · 45,2 kg · 6 volumes · R$ 1.234,56" (seção 5.6). */
export function loadSummaryText(load: LoadSummary): string {
  const parts = [
    `${load.orderCount} ${load.orderCount === 1 ? "pedido" : "pedidos"}`,
    `${formatWeightKg(load.weightGrams)}${load.weightIncomplete ? " (peso incompleto)" : ""}`,
    `${load.volumes} ${load.volumes === 1 ? "volume" : "volumes"}`,
    formatCents(load.totalCents),
  ];
  return parts.join(" · ");
}

export function LoadFigures({ load, capacityKg }: { load: LoadSummary; capacityKg?: number | null }) {
  const items = [
    { label: "Pedidos", value: String(load.orderCount) },
    { label: "Peso estimado", value: formatWeightKg(load.weightGrams), note: load.weightIncomplete ? "peso incompleto" : capacityKg ? `capacidade ${capacityKg.toLocaleString("pt-BR")} kg` : undefined },
    { label: "Volumes", value: String(load.volumes), note: "itens dos pedidos" },
    { label: "Valor total", value: formatCents(load.totalCents) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
          {item.note && <dd className="text-xs text-muted-foreground">{item.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Aviso, não bloqueio, de peso acima da capacidade do veículo (seção 5.6). */
export function CapacityWarning({ load, capacityKg }: { load: LoadSummary; capacityKg: number | null | undefined }) {
  if (!exceedsCapacity(load.weightGrams, capacityKg ?? null)) return null;
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden />
      <AlertDescription>
        Peso estimado de {formatWeightKg(load.weightGrams)} acima da capacidade do veículo ({capacityKg?.toLocaleString("pt-BR")} kg). Dá para seguir assim, mas confira a carga.
      </AlertDescription>
    </Alert>
  );
}
