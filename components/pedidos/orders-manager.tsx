"use client";

import { ClipboardListIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { cancelOrderAction, getOrderForEditAction, rescheduleOrderAction } from "@/app/app/pedidos/actions";
import { EmptyState } from "@/components/lista/empty-state";
import { Pagination } from "@/components/lista/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DAY_OF_WEEK_LABELS, dayOfWeekOfDateString, formatDateString } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus, isOrderEditable, isOrderReschedulable } from "@/domain/order-status";
import { PAYMENT_METHOD_LABELS } from "@/domain/payment";
import type { OrderFilterOptions, OrderListItemDTO } from "@/lib/services/orders";
import type { ListOrdersData } from "@/lib/validation/orders";

import { GenerateRecurringButton } from "./generate-recurring-button";
import type { CatalogItem } from "./items-editor";
import { OrderSheet, type OrderSheetMode } from "./order-sheet";

type Props = {
  date: string;
  today: string;
  tomorrow: string;
  filters: ListOrdersData;
  result: { items: OrderListItemDTO[]; total: number; page: number; pageCount: number; options: OrderFilterOptions };
  catalog: CatalogItem[];
  readOnly: boolean;
};

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PENDENTE: "secondary",
  EM_ROTA: "default",
  ENTREGUE: "default",
  ENTREGUE_PARCIAL: "secondary",
  NAO_ENTREGUE: "destructive",
  CANCELADO: "outline",
};

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function OrdersManager({ date, today, tomorrow, filters, result, catalog, readOnly }: Props) {
  const [sheet, setSheet] = useState<OrderSheetMode | null>(null);
  const [cancelling, setCancelling] = useState<OrderListItemDTO | null>(null);
  const [rescheduling, setRescheduling] = useState<OrderListItemDTO | null>(null);
  const [pending, startTransition] = useTransition();

  // Atalho "N" para novo pedido (fora de campos de texto).
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key.toLowerCase() === "n" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey && !readOnly && sheet === null) {
        event.preventDefault();
        setSheet({ kind: "novo", date });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [date, readOnly, sheet]);

  function openEdit(order: OrderListItemDTO) {
    startTransition(async () => {
      const response = await getOrderForEditAction({ id: order.id });
      if (response.ok) setSheet({ kind: "editar", order: response.data });
      else toast.error(response.error);
    });
  }

  const hasFilters = Boolean(filters.status || filters.bairro || filters.cliente || filters.rota);
  const pageHref = (pagina: number) => {
    const params = new URLSearchParams();
    if (date !== today) params.set("data", date);
    if (filters.status) params.set("situacao", filters.status);
    if (filters.bairro) params.set("bairro", filters.bairro);
    if (filters.cliente) params.set("cliente", filters.cliente);
    if (filters.rota) params.set("rota", filters.rota);
    if (pagina > 1) params.set("pagina", String(pagina));
    const text = params.toString();
    return text ? `/app/pedidos?${text}` : "/app/pedidos";
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          <p className="text-muted-foreground">
            {DAY_OF_WEEK_LABELS[dayOfWeekOfDateString(date)]}, {formatDateString(date)} · {result.total} {result.total === 1 ? "pedido" : "pedidos"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GenerateRecurringButton date={date} disabled={readOnly} />
          <Button onClick={() => setSheet({ kind: "novo", date })} disabled={readOnly}>
            <PlusIcon aria-hidden />
            Novo pedido <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">N</Kbd>
          </Button>
        </div>
      </div>

      <form action="/app/pedidos" method="get" className="flex flex-wrap items-center gap-2" aria-label="Filtros">
        {date !== today && <input type="hidden" name="data" value={date} />}
        <select name="situacao" defaultValue={filters.status ?? ""} aria-label="Situação" className={selectClass}>
          <option value="">Todas as situações</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select name="bairro" defaultValue={filters.bairro ?? ""} aria-label="Bairro" className={selectClass}>
          <option value="">Todos os bairros</option>
          {result.options.neighborhoods.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select name="rota" defaultValue={filters.rota ?? ""} aria-label="Rota" className={selectClass}>
          <option value="">Todas as rotas</option>
          <option value="sem-rota">Sem rota</option>
          {result.options.routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.code} · {route.name}
            </option>
          ))}
        </select>
        <Input name="cliente" defaultValue={filters.cliente ?? ""} placeholder="Cliente" aria-label="Cliente" className="w-48" />
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {hasFilters && (
          <Button asChild variant="ghost">
            <Link href={pageHref(1).replace(/[?&](situacao|bairro|cliente|rota)=[^&]*/g, "").replace(/\?$/, "") || "/app/pedidos"}>Limpar filtros</Link>
          </Button>
        )}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<ClipboardListIcon className="size-6" aria-hidden />}
          title={hasFilters ? "Nenhum pedido com estes filtros." : `Nenhum pedido para ${formatDateString(date)}.`}
          description={hasFilters ? undefined : "Lance um pedido ou gere os pedidos recorrentes do dia."}
          action={
            !hasFilters && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setSheet({ kind: "novo", date })} disabled={readOnly}>
                  Novo pedido
                </Button>
                <GenerateRecurringButton date={date} disabled={readOnly} />
              </div>
            )
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Bairro</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden lg:table-cell">Pagamento</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((order) => {
                const editable = isOrderEditable(order.status);
                const reschedulable = isOrderReschedulable(order.status) && order.rescheduledToNumber === null;
                return (
                  <TableRow key={order.id} className={order.status === "CANCELADO" ? "text-muted-foreground" : undefined}>
                    <TableCell className="tabular-nums">{order.orderNumber}</TableCell>
                    <TableCell>
                      <span className="font-medium">{order.customerName}</span>
                      <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        {order.recurring && <span>recorrente</span>}
                        {order.rescheduledFromNumber && <span>reagendado do nº {order.rescheduledFromNumber}</span>}
                        {order.rescheduledToNumber && <span>reagendado no nº {order.rescheduledToNumber}</span>}
                        {order.invoiceNumber && <span>NF-e {order.invoiceNumber}</span>}
                        {order.cancelReason && <span>motivo: {order.cancelReason}</span>}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{order.neighborhood}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{order.itemCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(order.totalCents)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                      {order.routeCode && <span className="ml-2 text-xs text-muted-foreground">{order.routeCode}</span>}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Ações do pedido ${order.orderNumber}`} disabled={readOnly || pending || (!editable && !reschedulable)}>
                            <MoreHorizontalIcon aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {editable && <DropdownMenuItem onSelect={() => openEdit(order)}>Editar</DropdownMenuItem>}
                          {editable && (
                            <DropdownMenuItem variant="destructive" onSelect={() => setCancelling(order)}>
                              Cancelar pedido
                            </DropdownMenuItem>
                          )}
                          {reschedulable && <DropdownMenuItem onSelect={() => setRescheduling(order)}>Reagendar</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={pageHref} />

      <OrderSheet mode={sheet} onClose={() => setSheet(null)} catalog={catalog} />
      <Dialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent className="sm:max-w-md">{cancelling && <CancelForm order={cancelling} onDone={() => setCancelling(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={rescheduling !== null} onOpenChange={(open) => !open && setRescheduling(null)}>
        <DialogContent className="sm:max-w-sm">
          {rescheduling && <RescheduleForm order={rescheduling} today={today} defaultDate={tomorrow} onDone={() => setRescheduling(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CancelForm({ order, onDone }: { order: OrderListItemDTO; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await cancelOrderAction({ id: order.id, version: order.version, reason });
          if (result.ok) {
            toast.success(`Pedido nº ${order.orderNumber} cancelado.`);
            onDone();
          } else setError(result.fieldErrors?.reason ?? result.error);
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Cancelar pedido nº {order.orderNumber}?</DialogTitle>
        <DialogDescription>
          {order.customerName} · {formatCents(order.totalCents)}. O cancelamento fica registrado com o motivo e não pode ser desfeito.
        </DialogDescription>
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="cancel-reason">Motivo</FieldLabel>
        <Textarea id="cancel-reason" autoFocus rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Voltar
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          Cancelar pedido
        </Button>
      </DialogFooter>
    </form>
  );
}

function RescheduleForm({ order, today, defaultDate, onDone }: { order: OrderListItemDTO; today: string; defaultDate: string; onDone: () => void }) {
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await rescheduleOrderAction({ id: order.id, deliveryDate: date });
          if (result.ok) {
            toast.success(`Pedido nº ${result.data.orderNumber} criado para ${formatDateString(date)}.`);
            onDone();
          } else setError(result.fieldErrors?.deliveryDate ?? result.error);
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Reagendar pedido nº {order.orderNumber}</DialogTitle>
        <DialogDescription>Cria um pedido novo, pendente, com os mesmos itens e preços. O pedido original continua como não entregue.</DialogDescription>
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="reschedule-date">Nova data</FieldLabel>
        <Input id="reschedule-date" type="date" min={today} autoFocus value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          Reagendar
        </Button>
      </DialogFooter>
    </form>
  );
}
