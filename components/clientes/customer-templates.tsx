"use client";

import { CalendarSyncIcon, PlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createTemplateAction, pauseTemplateAction, setTemplateActiveAction, updateTemplateAction } from "@/app/app/clientes/actions";
import { type CatalogItem, type EditorLine, ItemsEditor, newLineKey } from "@/components/pedidos/items-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS, type DayOfWeek, formatDateString } from "@/domain/dates";
import { centsToInput, formatCents } from "@/domain/money";
import { formatQuantity, milliToInput } from "@/domain/quantity";
import type { TemplateDTO } from "@/lib/services/templates";

type Props = { customerId: string; templates: TemplateDTO[]; catalog: CatalogItem[]; today: string; readOnly: boolean };

function statusOf(template: TemplateDTO, today: string): { label: string; variant: "default" | "secondary" | "outline" } {
  if (!template.active) return { label: "Desativado", variant: "outline" };
  if (template.pausedUntil && template.pausedUntil >= today) return { label: `Pausado até ${formatDateString(template.pausedUntil)}`, variant: "secondary" };
  if (template.startsOn > today) return { label: `Começa em ${formatDateString(template.startsOn)}`, variant: "secondary" };
  return { label: "Ativo", variant: "default" };
}

export function CustomerTemplates({ customerId, templates, catalog, today, readOnly }: Props) {
  const [editing, setEditing] = useState<TemplateDTO | "novo" | null>(null);
  const [pausing, setPausing] = useState<TemplateDTO | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? "Não foi possível concluir.");
    });
  }

  return (
    <section aria-labelledby="recorrentes" className="flex max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="recorrentes" className="text-lg font-semibold">
            Pedidos recorrentes
          </h2>
          <p className="text-sm text-muted-foreground">O gerador cria estes pedidos no dia da semana de cada um.</p>
        </div>
        <Button variant="outline" onClick={() => setEditing("novo")} disabled={readOnly}>
          <PlusIcon aria-hidden />
          Novo pedido recorrente
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <CalendarSyncIcon className="size-5 shrink-0" aria-hidden />
          Este cliente não tem pedido recorrente.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((template) => {
            const status = statusOf(template, today);
            const paused = template.pausedUntil !== null && template.pausedUntil >= today;
            return (
              <li key={template.id} className="flex flex-col gap-2 rounded-xl border p-3" aria-label={`Recorrente de ${DAY_OF_WEEK_LABELS[template.dayOfWeek]}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Toda {DAY_OF_WEEK_LABELS[template.dayOfWeek].toLowerCase()}</span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <ul className="text-sm text-muted-foreground">
                  {template.items.map((item) => (
                    <li key={item.productId} className={item.productActive ? undefined : "text-destructive"}>
                      {formatQuantity(item.quantityMilli)} {item.unit} · {item.productName}
                      {item.unitPriceCents !== null && ` · preço combinado ${formatCents(item.unitPriceCents)}`}
                      {!item.productActive && " · produto inativo: o gerador vai ignorar este recorrente"}
                    </li>
                  ))}
                </ul>
                {template.notes && <p className="text-sm">{template.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={readOnly || pending} onClick={() => setEditing(template)}>
                    Editar
                  </Button>
                  {template.active &&
                    (paused ? (
                      <Button size="sm" variant="outline" disabled={readOnly || pending} onClick={() => run(() => pauseTemplateAction({ id: template.id, pausedUntil: null }), "Recorrente retomado.")}>
                        Retomar
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={readOnly || pending} onClick={() => setPausing(template)}>
                        Pausar
                      </Button>
                    ))}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={readOnly || pending}
                    onClick={() => run(() => setTemplateActiveAction({ id: template.id, active: !template.active }), template.active ? "Recorrente desativado." : "Recorrente reativado.")}
                  >
                    {template.active ? "Desativar" : "Reativar"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          {editing !== null && <TemplateForm customerId={customerId} template={editing === "novo" ? null : editing} catalog={catalog} today={today} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={pausing !== null} onOpenChange={(open) => !open && setPausing(null)}>
        <DialogContent className="sm:max-w-sm">{pausing && <PauseForm template={pausing} today={today} onDone={() => setPausing(null)} />}</DialogContent>
      </Dialog>
    </section>
  );
}

function TemplateForm({ customerId, template, catalog, today, onDone }: { customerId: string; template: TemplateDTO | null; catalog: CatalogItem[]; today: string; onDone: () => void }) {
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(template?.dayOfWeek ?? "SEG");
  const [startsOn, setStartsOn] = useState(template?.startsOn ?? today);
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [lines, setLines] = useState<EditorLine[]>(
    template?.items.map((item) => ({
      key: newLineKey(),
      productId: item.productId,
      productName: item.productName,
      quantity: milliToInput(item.quantityMilli),
      unitPrice: item.unitPriceCents === null ? "" : centsToInput(item.unitPriceCents),
    })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setLineErrors({});
    startTransition(async () => {
      const payload = { dayOfWeek, startsOn, notes, items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice ?? "" })) };
      const result = template ? await updateTemplateAction({ id: template.id, ...payload }) : await createTemplateAction({ customerId, ...payload });
      if (result.ok) {
        toast.success(template ? "Recorrente salvo." : "Recorrente criado.");
        onDone();
        return;
      }
      setError(result.error);
      const perLine: Record<number, string> = {};
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        const match = /^items\.(\d+)$/.exec(field);
        if (match) perLine[Number(match[1])] = message;
      }
      setLineErrors(perLine);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{template ? "Editar pedido recorrente" : "Novo pedido recorrente"}</DialogTitle>
        <DialogDescription>Mudanças valem para os próximos pedidos gerados. Os já gerados não mudam.</DialogDescription>
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="template-day">Dia da semana</FieldLabel>
          <Select value={dayOfWeek} onValueChange={(value) => setDayOfWeek(value as DayOfWeek)}>
            <SelectTrigger id="template-day" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OF_WEEK.map((day) => (
                <SelectItem key={day} value={day}>
                  {DAY_OF_WEEK_LABELS[day]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="template-start">A partir de</FieldLabel>
          <Input id="template-start" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
        </Field>
      </div>
      <ItemsEditor catalog={catalog} lines={lines} onChange={setLines} lineErrors={lineErrors} withPrice />
      <Field>
        <FieldLabel htmlFor="template-notes">Observações (opcional)</FieldLabel>
        <Input id="template-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function PauseForm({ template, today, onDone }: { template: TemplateDTO; today: string; onDone: () => void }) {
  const [until, setUntil] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Pausar pedido recorrente</DialogTitle>
        <DialogDescription>Nenhum pedido é gerado até esta data, inclusive. Depois volta sozinho.</DialogDescription>
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="pause-until">Pausar até</FieldLabel>
        <Input id="pause-until" type="date" min={today} value={until} onChange={(event) => setUntil(event.target.value)} />
        <FieldDescription>Ex.: férias do cliente.</FieldDescription>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await pauseTemplateAction({ id: template.id, pausedUntil: until });
              if (result.ok) {
                toast.success(`Recorrente pausado até ${formatDateString(until)}.`);
                onDone();
              } else setError(result.error);
            })
          }
        >
          Pausar
        </Button>
      </DialogFooter>
    </div>
  );
}
