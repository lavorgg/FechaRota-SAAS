"use client";

// Stepper +/− com alvos de 48 px (seção 5.2).

import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Stepper({ label, value, min = 0, max, step = 1, format = String, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; format?: (value: number) => string; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button type="button" variant="outline" className="size-12 shrink-0" aria-label={`Diminuir ${label}`} disabled={value - step < min} onClick={() => onChange(Math.max(min, value - step))}>
        <MinusIcon aria-hidden />
      </Button>
      <output className="min-w-16 text-center text-lg font-semibold tabular-nums" aria-live="polite" aria-label={label}>
        {format(value)}
      </output>
      <Button type="button" variant="outline" className="size-12 shrink-0" aria-label={`Aumentar ${label}`} disabled={max !== undefined && value + step > max} onClick={() => onChange(max === undefined ? value + step : Math.min(max, value + step))}>
        <PlusIcon aria-hidden />
      </Button>
    </div>
  );
}
