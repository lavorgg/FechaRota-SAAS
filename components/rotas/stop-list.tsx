"use client";

// Paradas da rota em ordem. Em rascunho: arrastar (@dnd-kit, também pelo teclado) e botões
// subir/descer (seção 5.6).

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, XIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { formatWeightKg } from "@/domain/cargo-manifest";
import { formatCents } from "@/domain/money";
import { PAYMENT_METHOD_LABELS, isCollectedOnDelivery } from "@/domain/payment";
import { orderWeight } from "@/domain/route-planning";
import { cn } from "@/lib/utils";
import type { RouteStopDTO } from "@/lib/services/routes";

type Props = {
  stops: RouteStopDTO[];
  editable: boolean;
  disabled: boolean;
  onReorder: (orderIds: string[]) => void;
  onRemove: (stop: RouteStopDTO) => void;
};

export function StopList({ stops, editable, disabled, onReorder, onRemove }: Props) {
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = stops.map((stop) => stop.id);
  const describe = (id: UniqueIdentifier) => {
    const stop = stops.find((item) => item.id === id);
    return stop ? `do pedido nº ${stop.orderNumber}, ${stop.customerName}` : "";
  };
  const position = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Parada ${describe(active.id)} selecionada, na posição ${position(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `Parada ${describe(active.id)} sobre a posição ${position(over.id)}.` : `Parada ${describe(active.id)} fora da lista.`),
    onDragEnd: ({ active, over }) => (over ? `Parada ${describe(active.id)} solta na posição ${position(over.id)}.` : `Parada ${describe(active.id)} solta.`),
    onDragCancel: ({ active }) => `Movimento da parada ${describe(active.id)} cancelado.`,
  };

  function move(from: number, to: number) {
    if (to < 0 || to >= ids.length || from === to) return;
    onReorder(arrayMove(ids, from, to));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  }

  const list = (
    <ol className="flex flex-col gap-2" aria-label="Paradas da rota">
      {stops.map((stop, index) => (
        <StopRow
          key={stop.id}
          stop={stop}
          position={index + 1}
          last={index === stops.length - 1}
          editable={editable}
          disabled={disabled}
          onUp={() => move(index, index - 1)}
          onDown={() => move(index, index + 1)}
          onRemove={() => onRemove(stop)}
        />
      ))}
    </ol>
  );

  if (!editable) return list;
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "Para mover a parada, pressione espaço ou Enter, use as setas para cima e para baixo e pressione espaço ou Enter de novo para soltar. Esc cancela.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        {list}
      </SortableContext>
    </DndContext>
  );
}

function StopRow({
  stop,
  position,
  last,
  editable,
  disabled,
  onUp,
  onDown,
  onRemove,
}: {
  stop: RouteStopDTO;
  position: number;
  last: boolean;
  editable: boolean;
  disabled: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const sortable = useSortable({ id: stop.id, disabled: !editable || disabled });
  const weight = orderWeight(stop);
  const label = `parada ${position} (pedido nº ${stop.orderNumber}, ${stop.customerName})`;
  const style = editable ? { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition } : undefined;

  return (
    <li
      ref={editable ? sortable.setNodeRef : undefined}
      style={style}
      data-testid="parada"
      className={cn("flex items-start gap-3 rounded-xl border bg-background p-3", sortable.isDragging && "relative z-10 shadow-lg")}
    >
      {editable && (
        <button
          type="button"
          className="mt-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Arrastar ${label}`}
          disabled={disabled}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
      )}
      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-foreground text-sm font-semibold tabular-nums" aria-hidden>
        {position}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium">
          <span className="sr-only">Parada {position}: </span>
          <span className="text-muted-foreground tabular-nums">nº {stop.orderNumber}</span> {stop.customerName}
        </p>
        <p className="text-sm">
          {stop.addressLine}
          {stop.complement ? ` · ${stop.complement}` : ""}
        </p>
        {stop.referencePoint && <p className="text-sm text-muted-foreground">Referência: {stop.referencePoint}</p>}
        <p className="text-xs text-muted-foreground tabular-nums">
          {stop.items.length} {stop.items.length === 1 ? "item" : "itens"} · {formatWeightKg(weight.grams)}
          {weight.incomplete ? " (peso incompleto)" : ""} · {formatCents(stop.totalCents)} ·{" "}
          {isCollectedOnDelivery(stop.paymentMethod) ? `cobrar ${formatCents(stop.amountToCollectCents)} (${PAYMENT_METHOD_LABELS[stop.paymentMethod]})` : `${PAYMENT_METHOD_LABELS[stop.paymentMethod]}, não cobrar`}
        </p>
      </div>
      {editable && (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label={`Subir ${label}`} disabled={disabled || position === 1} onClick={onUp}>
            <ArrowUpIcon aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Descer ${label}`} disabled={disabled || last} onClick={onDown}>
            <ArrowDownIcon aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Tirar o pedido nº ${stop.orderNumber} da rota`} disabled={disabled} onClick={onRemove}>
            <XIcon aria-hidden />
          </Button>
        </div>
      )}
    </li>
  );
}
