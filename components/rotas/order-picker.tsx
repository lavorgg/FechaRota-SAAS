"use client";

// Agrupador (seção 5.6): pedidos por cidade e bairro, com seleção do bairro inteiro ou de
// pedidos individuais.

import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatWeightKg } from "@/domain/cargo-manifest";
import { formatCents } from "@/domain/money";
import { type CityGroup, type NeighborhoodGroup, orderWeight } from "@/domain/route-planning";

import { loadSummaryText } from "./load-summary";

export function OrderPicker({
  groups,
  selected,
  onChange,
  disabled,
}: {
  groups: CityGroup[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  function toggle(ids: string[], checked: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  }

  function toggleExpanded(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((city) => (
        <section key={city.cityKey} aria-label={city.city} className="flex flex-col gap-2">
          <header className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-base font-semibold">{city.city}</h2>
            <p className="text-xs text-muted-foreground">{loadSummaryText(city)}</p>
          </header>
          <ul className="flex flex-col divide-y rounded-xl border">
            {city.neighborhoods.map((group) => (
              <NeighborhoodRow
                key={group.key}
                city={city.city}
                group={group}
                selected={selected}
                expanded={expanded.has(group.key)}
                disabled={disabled}
                onToggle={toggle}
                onExpand={() => toggleExpanded(group.key)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NeighborhoodRow({
  city,
  group,
  selected,
  expanded,
  disabled,
  onToggle,
  onExpand,
}: {
  city: string;
  group: NeighborhoodGroup;
  selected: ReadonlySet<string>;
  expanded: boolean;
  disabled?: boolean;
  onToggle: (ids: string[], checked: boolean) => void;
  onExpand: () => void;
}) {
  const ids = group.orders.map((order) => order.id);
  const count = ids.filter((id) => selected.has(id)).length;
  const state = count === 0 ? false : count === ids.length ? true : "indeterminate";
  const listId = `pedidos-${group.key.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Checkbox
          checked={state}
          onCheckedChange={(checked) => onToggle(ids, checked === true)}
          disabled={disabled}
          aria-label={`Selecionar o bairro ${group.neighborhood} (${city})`}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">
            {group.neighborhood}
            {count > 0 && count < ids.length && <span className="ml-2 text-xs font-normal text-muted-foreground">{count} de {ids.length} selecionados</span>}
          </span>
          <span className="text-xs text-muted-foreground">{loadSummaryText(group)}</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onExpand} aria-expanded={expanded} aria-controls={listId}>
          {expanded ? <ChevronDownIcon aria-hidden /> : <ChevronRightIcon aria-hidden />}
          {expanded ? "Ocultar pedidos" : "Ver pedidos"}
          <span className="sr-only"> de {group.neighborhood}</span>
        </Button>
      </div>
      {expanded && (
        <ul id={listId} className="flex flex-col border-t bg-muted/30">
          {group.orders.map((order) => {
            const weight = orderWeight(order);
            const checkboxId = `pedido-${order.id}`;
            return (
              <li key={order.id} className="flex items-center gap-3 py-2 pr-3 pl-9">
                <Checkbox id={checkboxId} checked={selected.has(order.id)} onCheckedChange={(checked) => onToggle([order.id], checked === true)} disabled={disabled} />
                <label htmlFor={checkboxId} className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="min-w-0">
                    <span className="tabular-nums text-muted-foreground">nº {order.orderNumber}</span> <span className="font-medium">{order.customerName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {order.street}, {order.number}
                    </span>
                  </span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatWeightKg(weight.grams)}
                    {weight.incomplete ? " (peso incompleto)" : ""} · {formatCents(order.totalCents)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
