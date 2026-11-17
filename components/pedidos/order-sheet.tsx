"use client";

import { RepeatIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createOrderAction, customerOrderContextAction, updateOrderAction } from "@/app/app/pedidos/actions";
import { ConfirmDialog } from "@/components/lista/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS, type DayOfWeek, dayOfWeekOfDateString, formatDateString, isValidDateString } from "@/domain/dates";
import { formatCents } from "@/domain/money";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod, isCollectedOnDelivery } from "@/domain/payment";
import { milliToInput } from "@/domain/quantity";
import type { LastOrderDTO, OrderCustomerOption, OrderForEditDTO } from "@/lib/services/orders";

import { CustomerSearch } from "./customer-search";
import { type CatalogItem, type EditorLine, ItemsEditor, newLineKey, previewTotal } from "./items-editor";

export type OrderSheetMode = { kind: "novo"; date: string } | { kind: "editar"; order: OrderForEditDTO };

type Props = { mode: OrderSheetMode | null; onClose: () => void; catalog: CatalogItem[] };

type FormState = {
  customer: OrderCustomerOption | null;
  deliveryDate: string;
  paymentMethod: PaymentMethod;
  lines: EditorLine[];
  notes: string;
  invoiceNumber: string;
  recurring: boolean;
  recurringDay: DayOfWeek;
};

function initialState(mode: OrderSheetMode): FormState {
  if (mode.kind === "editar") {
    const { order } = mode;
    return {
      customer: order.customer,
      deliveryDate: order.deliveryDate,
      paymentMethod: order.paymentMethod,
      lines: order.items.map((item) => ({ key: newLineKey(), productId: item.productId, productName: item.productName, quantity: milliToInput(item.quantityMilli) })),
      notes: order.notes ?? "",
      invoiceNumber: order.invoiceNumber ?? "",
      recurring: false,
      recurringDay: dayOfWeekOfDateString(order.deliveryDate),
    };
  }
  return {
    customer: null,
    deliveryDate: mode.date,
    paymentMethod: "DINHEIRO",
    lines: [],
    notes: "",
    invoiceNumber: "",
    recurring: false,
    recurringDay: dayOfWeekOfDateString(mode.date),
  };
}

/** Lançamento rápido (seção 5.5) em gaveta lateral. `Ctrl+Enter` salva; `Esc` fecha. */
export function OrderSheet({ mode, onClose, catalog }: Props) {
  return (
    <Sheet open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {mode && <OrderForm key={mode.kind === "editar" ? mode.order.id : "novo"} mode={mode} onClose={onClose} catalog={catalog} />}
      </SheetContent>
    </Sheet>
  );
}

function OrderForm({ mode, onClose, catalog }: { mode: OrderSheetMode; onClose: () => void; catalog: CatalogItem[] }) {
  const editing = mode.kind === "editar" ? mode.order : null;
  const [state, setState] = useState<FormState>(() => initialState(mode));
  const [context, setContext] = useState<{ lastOrder: LastOrderDTO | null; ordersOnDate: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const customerRef = useRef<HTMLInputElement>(null);
  const productRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((current) => ({ ...current, [key]: value }));

  const loadContext = useCallback(async (customerId: string, date: string) => {
    if (!isValidDateString(date)) return;
    const response = await customerOrderContextAction({ customerId, date });
    if (response.ok) setContext(response.data);
  }, []);

  useEffect(() => {
    const target = editing ? productRef.current : customerRef.current;
    const timer = setTimeout(() => target?.focus(), 50);
    return () => clearTimeout(timer);
  }, [editing]);

  useEffect(() => {
    if (!state.customer) return;
    const timer = setTimeout(() => void loadContext(state.customer?.id ?? "", state.deliveryDate), 0);
    return () => clearTimeout(timer);
  }, [state.customer, state.deliveryDate, loadContext]);

  function selectCustomer(customer: OrderCustomerOption) {
    setState((current) => ({ ...current, customer, paymentMethod: customer.defaultPaymentMethod }));
    setTimeout(() => productRef.current?.focus(), 0);
  }

  function repeatLastOrder() {
    if (!context?.lastOrder) return;
    const available = new Set(catalog.map((product) => product.id));
    const items = context.lastOrder.items.filter((item) => available.has(item.productId));
    set(
      "lines",
      items.map((item) => ({ key: newLineKey(), productId: item.productId, productName: item.productName, quantity: milliToInput(item.quantityMilli) })),
    );
    const skipped = context.lastOrder.items.length - items.length;
    if (skipped > 0) toast.warning(`${skipped} ${skipped === 1 ? "item ficou" : "itens ficaram"} de fora: produto inativo.`);
    productRef.current?.focus();
  }

  function submit(confirmDuplicate = false) {
    if (!state.customer) {
      setError("Escolha o cliente.");
      customerRef.current?.focus();
      return;
    }
    setError(null);
    setFieldErrors({});
    const common = {
      deliveryDate: state.deliveryDate,
      paymentMethod: state.paymentMethod,
      items: state.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      notes: state.notes,
      invoiceNumber: state.invoiceNumber,
      confirmDuplicate,
    };
    startTransition(async () => {
      const result = editing
        ? await updateOrderAction({ id: editing.id, version: editing.version, ...common })
        : await createOrderAction({ customerId: state.customer?.id, ...common, recurringDayOfWeek: state.recurring ? state.recurringDay : null });

      if (result.ok) {
        toast.success(`Pedido nº ${result.data.orderNumber} ${editing ? "salvo" : "lançado"} · ${formatCents(result.data.totalCents)}`);
        if (editing) {
          onClose();
          return;
        }
        // Próximo pedido: mantém a data, limpa o resto e volta para a busca de cliente.
        setState(initialState({ kind: "novo", date: state.deliveryDate }));
        setContext(null);
        setTimeout(() => customerRef.current?.focus(), 0);
        return;
      }
      if (result.code === "CONFIRMACAO") {
        setConfirming(result.error);
        return;
      }
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  }

  function onKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    // Ctrl+Enter (Cmd+Enter no Mac) salva de qualquer campo, antes da busca de produto tratar o Enter.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      submit();
    }
  }

  const lineErrors = Object.fromEntries(
    Object.entries(fieldErrors).flatMap(([field, message]) => {
      const match = /^items\.(\d+)$/.exec(field);
      return match ? [[Number(match[1]), message]] : [];
    }),
  );
  const total = previewTotal(state.lines, catalog);
  const collects = isCollectedOnDelivery(state.paymentMethod);
  const duplicates = (context?.ordersOnDate ?? []).filter((number) => number !== editing?.orderNumber);

  return (
    <div className="flex min-h-full flex-col" onKeyDownCapture={onKeyDownCapture}>
      <SheetHeader className="border-b">
        <SheetTitle>{editing ? `Editar pedido nº ${editing.orderNumber}` : "Novo pedido"}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> salva
          </span>
          <span>
            <Kbd>Esc</Kbd> fecha
          </span>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 p-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section aria-label="Cliente" className="flex flex-col gap-2">
          {state.customer ? (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{state.customer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {state.customer.neighborhood} · {state.customer.city}
                  </p>
                </div>
                {!editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set("customer", null);
                      setContext(null);
                      setTimeout(() => customerRef.current?.focus(), 0);
                    }}
                  >
                    <XIcon aria-hidden />
                    Trocar
                  </Button>
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-muted-foreground">Pagamento padrão</dt>
                <dd>{PAYMENT_METHOD_LABELS[state.customer.defaultPaymentMethod]}</dd>
                <dt className="text-muted-foreground">Janela de entrega</dt>
                <dd>{state.customer.deliveryWindow ?? "—"}</dd>
                {context?.lastOrder && (
                  <>
                    <dt className="text-muted-foreground">Último pedido</dt>
                    <dd>
                      nº {context.lastOrder.orderNumber} em {formatDateString(context.lastOrder.deliveryDate)} ({context.lastOrder.items.length}{" "}
                      {context.lastOrder.items.length === 1 ? "item" : "itens"})
                    </dd>
                  </>
                )}
              </dl>
              {!editing && context?.lastOrder && (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={repeatLastOrder}>
                    <RepeatIcon aria-hidden />
                    Repetir último pedido
                  </Button>
                </div>
              )}
              {duplicates.length > 0 && (
                <p role="status" className="flex items-center gap-2 text-sm text-amber-700">
                  <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
                  Já tem pedido nº {duplicates.join(", ")} para {formatDateString(state.deliveryDate)}.
                </p>
              )}
            </div>
          ) : (
            <CustomerSearch onSelect={selectCustomer} inputRef={customerRef} />
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={Boolean(fieldErrors.deliveryDate)}>
            <FieldLabel htmlFor="deliveryDate">Data de entrega</FieldLabel>
            <Input
              id="deliveryDate"
              type="date"
              value={state.deliveryDate}
              disabled={editing?.recurring}
              onChange={(event) => {
                set("deliveryDate", event.target.value);
                if (isValidDateString(event.target.value)) set("recurringDay", dayOfWeekOfDateString(event.target.value));
              }}
            />
            {editing?.recurring && <FieldDescription>Pedido de recorrente: para outra data, cancele e lance um avulso.</FieldDescription>}
            <FieldError>{fieldErrors.deliveryDate}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="paymentMethod">Forma de pagamento</FieldLabel>
            <Select value={state.paymentMethod} onValueChange={(value) => set("paymentMethod", value as PaymentMethod)}>
              <SelectTrigger id="paymentMethod" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <section aria-label="Itens do pedido" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Itens</h3>
          <ItemsEditor catalog={catalog} lines={state.lines} onChange={(lines) => set("lines", lines)} lineErrors={lineErrors} searchRef={productRef} />
          {fieldErrors.items && !Object.keys(lineErrors).length && <FieldError>{fieldErrors.items}</FieldError>}
        </section>

        <div className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2" aria-live="polite">
          <span className="text-sm text-muted-foreground">{collects ? "Total a cobrar na entrega" : `Total (${PAYMENT_METHOD_LABELS[state.paymentMethod].toLowerCase()}: não cobrar)`}</span>
          <span className="text-lg font-semibold tabular-nums" data-testid="total-pedido">
            {formatCents(total.cents)}
            {!total.complete && <span className="ml-1 text-xs font-normal text-destructive">(confira os itens)</span>}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field>
            <FieldLabel htmlFor="notes">Observações (opcional)</FieldLabel>
            <Textarea id="notes" rows={2} value={state.notes} onChange={(event) => set("notes", event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="invoiceNumber">Nº da NF-e (opcional)</FieldLabel>
            <Input id="invoiceNumber" value={state.invoiceNumber} onChange={(event) => set("invoiceNumber", event.target.value)} />
            <FieldError>{fieldErrors.invoiceNumber}</FieldError>
          </Field>
        </div>

        {!editing && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <Field orientation="horizontal" className="w-auto">
              <Checkbox id="recurring" checked={state.recurring} onCheckedChange={(checked) => set("recurring", checked === true)} />
              <FieldLabel htmlFor="recurring">Salvar também como pedido recorrente</FieldLabel>
            </Field>
            {state.recurring && (
              <Select value={state.recurringDay} onValueChange={(value) => set("recurringDay", value as DayOfWeek)}>
                <SelectTrigger className="w-44" aria-label="Dia da semana do recorrente">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day} value={day}>
                      Toda {DAY_OF_WEEK_LABELS[day].toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-popover p-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Fechar
        </Button>
        <Button type="button" onClick={() => submit()} disabled={pending}>
          {pending ? "Salvando..." : editing ? "Salvar pedido" : "Lançar pedido"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title="Cliente já tem pedido nesta data"
        description={confirming ?? ""}
        confirmLabel="Lançar mesmo assim"
        pending={pending}
        onConfirm={() => {
          setConfirming(null);
          submit(true);
        }}
        onOpenChange={(open) => !open && setConfirming(null)}
      />
    </div>
  );
}
