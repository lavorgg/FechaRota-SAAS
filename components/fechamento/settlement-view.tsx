"use client";

// Tela de fechamento e acerto (seção 5.8): mercadoria, dinheiro, Pix, vasilhames, pendências e
// comprovantes; "Concluir acerto".

import { ArrowLeftIcon, CheckCircle2Icon, FileTextIcon, ImageIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { concludeSettlementAction, correctDeliveryPaymentAction, proofFilesAction, setPixConfirmationAction } from "@/app/app/rotas/[id]/fechamento/actions";
import { rescheduleOrderAction } from "@/app/app/pedidos/actions";
import { ConfirmDialog } from "@/components/lista/confirm-dialog";
import { RouteStatusBadge } from "@/components/rotas/route-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DAY_OF_WEEK_LABELS, dayOfWeekOfDateString, formatDateString } from "@/domain/dates";
import { DELIVERY_OUTCOME_LABELS, FAILURE_REASON_LABELS } from "@/domain/delivery";
import { centsToInput, formatCents, parseBRLToCents } from "@/domain/money";
import { ORDER_STATUS_LABELS } from "@/domain/order-status";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, isCollectedOnDelivery } from "@/domain/payment";
import { formatQuantity } from "@/domain/quantity";
import { calcDifferenceCents, differenceLabel, isDeliveredStatus } from "@/domain/settlement";
import type { ProofFilesDTO, SettlementDTO, SettlementStopDTO } from "@/lib/services/settlement";
import { cn } from "@/lib/utils";

type Props = { data: SettlementDTO; canCorrect: boolean; readOnly: boolean; today: string; tomorrow: string };

function Section({ id, title, children, description }: { id: string; title: string; children: React.ReactNode; description?: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "falta" | "sobra" | "ok" }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-lg border px-3 py-2", tone === "falta" && "border-2 border-destructive", tone === "sobra" && "border-2 border-amber-600")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

export function SettlementView({ data, canCorrect, readOnly, today, tomorrow }: Props) {
  const { route, settlement, stops } = data;
  const [cashText, setCashText] = useState(data.settlement.money.cashHandedInCents === null ? "" : centsToInput(data.settlement.money.cashHandedInCents));
  const [confirming, setConfirming] = useState(false);
  const [proofOf, setProofOf] = useState<SettlementStopDTO | null>(null);
  const [correcting, setCorrecting] = useState<SettlementStopDTO | null>(null);
  const [rescheduling, setRescheduling] = useState<SettlementStopDTO | null>(null);
  const [pending, startTransition] = useTransition();

  const awaiting = route.status === "AGUARDANDO_ACERTO";
  const concluded = route.status === "CONCLUIDA";
  const money = settlement.money;
  const cashParsed = cashText.trim() === "" ? null : parseBRLToCents(cashText);
  const cashHandedIn = concluded ? money.cashHandedInCents : cashParsed?.ok ? cashParsed.cents : null;
  const difference = cashHandedIn === null ? null : calcDifferenceCents({ cashHandedInCents: cashHandedIn, expectedCents: money.expectedCents, pixInformedCents: money.pixInformedCents });
  const expectedCash = money.expectedCents - money.pixInformedCents;
  const notDelivered = stops.filter((stop) => stop.status === "NAO_ENTREGUE");

  function togglePix(orderId: string, confirmed: boolean) {
    startTransition(async () => {
      const result = await setPixConfirmationAction({ orderId, confirmed });
      if (result.ok) toast.success(confirmed ? "Pix confirmado no extrato." : "Confirmação do Pix desfeita.");
      else toast.error(result.error);
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href={`/app/rotas/${route.id}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden />
          Voltar para a rota
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              Fechamento · {route.code} · {route.name} <RouteStatusBadge status={route.status} />
            </h1>
            <p className="text-muted-foreground">
              {DAY_OF_WEEK_LABELS[dayOfWeekOfDateString(route.deliveryDate)]}, {formatDateString(route.deliveryDate)} · Motorista {route.driverName}
              {route.vehicle ? ` · ${route.vehicle.plate}` : ""}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/app/rotas/${route.id}/fechamento/resumo`}>
              <FileTextIcon aria-hidden />
              Resumo do acerto (A4)
            </Link>
          </Button>
        </div>
      </div>

      {route.status === "EM_ANDAMENTO" && (
        <Alert>
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>
            {settlement.openStops} {settlement.openStops === 1 ? "parada ainda sem desfecho" : "paradas ainda sem desfecho"} ou ainda não {settlement.openStops === 1 ? "sincronizada" : "sincronizadas"} pelo celular do motorista.
            Os números abaixo são parciais; o acerto pode ser concluído quando todas as paradas estiverem registradas.
          </AlertDescription>
        </Alert>
      )}
      {concluded && (
        <Alert>
          <CheckCircle2Icon aria-hidden />
          <AlertDescription>
            Acerto concluído em {route.closedAt} por {route.closedByName}.{money.pixPendingCents > 0 ? " Ainda há Pix a conferir: confirme quando aparecer no extrato." : ""}
          </AlertDescription>
        </Alert>
      )}

      <Section id="mercadoria" title="Mercadoria" description="Carregado, entregue e devolvido (parcial + não entregue), por produto.">
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Carregado</TableHead>
                <TableHead className="text-right">Entregue</TableHead>
                <TableHead className="text-right">Devolvido</TableHead>
                {settlement.openStops > 0 && <TableHead className="text-right">Sem desfecho</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlement.goods.map((line) => (
                <TableRow key={line.productId} className={cn(line.returnedMilli > 0 && "bg-amber-50 dark:bg-amber-950/30")}>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{line.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(line.loadedMilli)} {line.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(line.deliveredMilli)} {line.unit}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", line.returnedMilli > 0 && "font-semibold")}>
                    {line.returnedMilli > 0 && <TriangleAlertIcon className="mr-1 inline size-4" aria-label="Diferença" />}
                    {formatQuantity(line.returnedMilli)} {line.unit}
                  </TableCell>
                  {settlement.openStops > 0 && (
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.openMilli)} {line.unit}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section id="dinheiro" title="Dinheiro" description="Esperado: valor a cobrar dos pedidos entregues. Pix informado só conta como recebido depois de conferido no extrato.">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Figure label="Esperado" value={formatCents(money.expectedCents)} />
          <Figure label="Recebido em dinheiro" value={formatCents(money.cashCents)} />
          <Figure label="Pix informado" value={formatCents(money.pixInformedCents)} />
          <Figure label="Pix conferido" value={formatCents(money.pixConfirmedCents)} />
          <Figure label="Pix a conferir" value={formatCents(money.pixPendingCents)} />
          <Figure label="Recebido (dinheiro + Pix conferido)" value={formatCents(money.receivedCents)} />
        </dl>
        <div className="flex flex-wrap items-end gap-4 rounded-xl border p-4">
          <Field className="max-w-xs">
            <FieldLabel htmlFor="cash-handed-in">Dinheiro entregue pelo motorista no caixa</FieldLabel>
            <Input
              id="cash-handed-in"
              inputMode="decimal"
              placeholder="0,00"
              value={concluded ? centsToInput(money.cashHandedInCents ?? 0) : cashText}
              disabled={concluded || readOnly}
              onChange={(event) => setCashText(event.target.value)}
              aria-invalid={cashParsed !== null && !cashParsed.ok}
            />
            {cashParsed !== null && !cashParsed.ok && <FieldError>{cashParsed.error}</FieldError>}
            <FieldDescription>Dinheiro esperado no caixa: {formatCents(expectedCash)} (esperado − Pix informado).</FieldDescription>
          </Field>
          {difference !== null && (
            <p data-testid="diferenca-caixa" className={cn("rounded-lg border-2 px-3 py-2 text-lg font-semibold", difference < 0 ? "border-destructive" : difference > 0 ? "border-amber-600" : "border-green-700")}>
              {differenceLabel(difference)}
            </p>
          )}
        </div>
      </Section>

      <Section id="pix" title="Pix" description={settlement.pix.length === 0 ? "Nenhum Pix informado nesta rota." : "Marque quando o valor aparecer no extrato."}>
        {settlement.pix.length > 0 && (
          <ul className="flex flex-col divide-y rounded-xl border">
            {settlement.pix.map((line) => (
              <li key={line.orderId} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  id={`pix-${line.orderId}`}
                  checked={line.confirmed}
                  disabled={readOnly || pending || (concluded && line.confirmed)}
                  onCheckedChange={(checked) => togglePix(line.orderId, checked === true)}
                />
                <label htmlFor={`pix-${line.orderId}`} className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
                  <span>
                    Parada {line.stopSequence} · {line.customerName} · pedido nº {line.orderNumber}
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {formatCents(line.amountCents)}
                    <Badge variant={line.confirmed ? "default" : "outline"}>{line.confirmed ? "Confirmado no extrato" : "A conferir"}</Badge>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="vasilhames" title="Vasilhames">
        {settlement.containers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum vasilhame retornável nesta rota.</p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vasilhame</TableHead>
                  <TableHead className="text-right">Saíram</TableHead>
                  <TableHead className="text-right">Deixados</TableHead>
                  <TableHead className="text-right">Recolhidos</TableHead>
                  <TableHead className="text-right">Voltam ao depósito</TableHead>
                  <TableHead className="text-right">Saldo da rota com clientes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlement.containers.map((line) => (
                  <TableRow key={line.productId}>
                    <TableCell>{line.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.out}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.left}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.collected}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.backToDepot}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.withCustomers}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section id="pendencias" title="Pendências" description="Pedidos não entregues.">
        {notDelivered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido não entregue.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {notDelivered.map((stop) => (
              <li key={stop.orderId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <span className="flex flex-col">
                  <span className="font-medium">
                    Pedido nº {stop.orderNumber} · {stop.customerName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {stop.proof?.failureReason ? FAILURE_REASON_LABELS[stop.proof.failureReason] : "Sem motivo"}
                    {stop.proof?.failureNote ? ` · ${stop.proof.failureNote}` : ""}
                  </span>
                </span>
                {stop.rescheduledToNumber ? (
                  <Badge variant="secondary">Reagendado no nº {stop.rescheduledToNumber}</Badge>
                ) : (
                  <Button variant="outline" disabled={readOnly} onClick={() => setRescheduling(stop)}>
                    Reagendar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="paradas" title="Paradas e comprovantes">
        <ul className="flex flex-col gap-2">
          {stops.map((stop) => (
            <li key={stop.orderId} data-testid="parada-acerto" className="flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {stop.stopSequence}. {stop.customerName} <span className="text-muted-foreground">· pedido nº {stop.orderNumber}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{stop.proof ? DELIVERY_OUTCOME_LABELS[stop.proof.outcome] : ORDER_STATUS_LABELS[stop.status]}</Badge>
                  <Badge variant="outline">{PAYMENT_STATUS_LABELS[stop.paymentStatus]}</Badge>
                </span>
              </div>
              {stop.proof && (
                <p className="text-sm text-muted-foreground">
                  {stop.proof.deliveredAt}
                  {stop.proof.receiverName ? ` · recebido por ${stop.proof.receiverName}` : ""}
                  {stop.proof.receiverDocument ? ` (doc. ${stop.proof.receiverDocument})` : ""}
                  {isCollectedOnDelivery(stop.paymentMethod)
                    ? ` · a cobrar ${formatCents(stop.amountToCollectCents)} · dinheiro ${formatCents(stop.proof.cashCents)} · Pix ${formatCents(stop.proof.pixCents)}`
                    : ` · ${PAYMENT_METHOD_LABELS[stop.paymentMethod]}, sem cobrança na entrega`}
                </p>
              )}
              {stop.returns.length > 0 && (
                <p className="text-sm">Devolução: {stop.returns.map((item) => `${item.productName} (${item.returnReason})`).join("; ")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {stop.proof && (stop.proof.hasSignature || stop.proof.photoCount > 0) && (
                  <Button variant="outline" size="sm" onClick={() => setProofOf(stop)}>
                    <ImageIcon aria-hidden />
                    Ver comprovante
                  </Button>
                )}
                {canCorrect && !concluded && !readOnly && stop.proof && isDeliveredStatus(stop.status) && isCollectedOnDelivery(stop.paymentMethod) && (
                  <Button variant="outline" size="sm" onClick={() => setCorrecting(stop)}>
                    <PencilIcon aria-hidden />
                    Corrigir valores
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {awaiting && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3">
          <p className="text-sm text-muted-foreground">
            {cashHandedIn === null ? "Informe o dinheiro entregue no caixa para concluir." : difference !== null ? differenceLabel(difference) : ""}
            {money.pixPendingCents > 0 ? ` · ${formatCents(money.pixPendingCents)} em Pix ainda a conferir` : ""}
          </p>
          <Button disabled={readOnly || pending || cashHandedIn === null} onClick={() => setConfirming(true)}>
            Concluir acerto
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Concluir o acerto da rota ${route.code}?`}
        description={`Esperado ${formatCents(money.expectedCents)} · dinheiro no caixa ${formatCents(cashHandedIn ?? 0)} · ${difference === null ? "" : differenceLabel(difference)}.${money.pixPendingCents > 0 ? ` ${formatCents(money.pixPendingCents)} em Pix continuam a conferir.` : ""} A rota passa para "Concluída".`}
        confirmLabel="Concluir acerto"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await concludeSettlementAction({ id: route.id, version: route.version, cashHandedInCents: cashHandedIn ?? 0 });
            setConfirming(false);
            if (result.ok) toast.success(`Acerto da rota ${route.code} concluído.`);
            else toast.error(result.error);
          })
        }
      />
      <Dialog open={proofOf !== null} onOpenChange={(open) => !open && setProofOf(null)}>
        <DialogContent className="sm:max-w-2xl">{proofOf && <ProofDialog stop={proofOf} />}</DialogContent>
      </Dialog>
      <Dialog open={correcting !== null} onOpenChange={(open) => !open && setCorrecting(null)}>
        <DialogContent className="sm:max-w-md">{correcting && <CorrectionForm stop={correcting} onDone={() => setCorrecting(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={rescheduling !== null} onOpenChange={(open) => !open && setRescheduling(null)}>
        <DialogContent className="sm:max-w-sm">{rescheduling && <RescheduleForm stop={rescheduling} today={today} defaultDate={tomorrow} onDone={() => setRescheduling(null)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function ProofDialog({ stop }: { stop: SettlementStopDTO }) {
  const [files, setFiles] = useState<ProofFilesDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = files === null && error === null;

  // As URLs (5 minutos) são pedidas só quando o comprovante é aberto.
  useEffect(() => {
    let active = true;
    void proofFilesAction({ orderId: stop.orderId }).then((result) => {
      if (!active) return;
      if (result.ok) setFiles(result.data);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [stop.orderId]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Comprovante · parada {stop.stopSequence} · {stop.customerName}
        </DialogTitle>
        <DialogDescription>
          {stop.proof?.deliveredAt}
          {stop.proof?.receiverName ? ` · recebido por ${stop.proof.receiverName}` : ""}
          {stop.proof?.location ? ` · local registrado (${stop.proof.location.latitude.toFixed(5)}, ${stop.proof.location.longitude.toFixed(5)})` : " · sem localização"}
        </DialogDescription>
      </DialogHeader>
      {loading && <p className="text-sm text-muted-foreground">Carregando arquivos...</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {files && (
        <div className="flex flex-col gap-4">
          {files.signatureUrl && (
            <figure className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL pré-assinada de 5 minutos, sem otimização de imagem */}
              <img src={files.signatureUrl} alt="Assinatura do recebedor" className="max-h-48 w-fit rounded border bg-white object-contain" />
              <figcaption className="text-xs text-muted-foreground">Assinatura</figcaption>
            </figure>
          )}
          {files.photoUrls.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {files.photoUrls.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- URL pré-assinada de 5 minutos, sem otimização de imagem
                <img key={url} src={url} alt={`Foto ${index + 1} da entrega`} className="w-full rounded border object-cover" />
              ))}
            </div>
          )}
          {files.removedByRetention > 0 && <p className="text-sm text-muted-foreground">{files.removedByRetention} arquivo(s) removido(s) pela política de retenção.</p>}
          <p className="text-xs text-muted-foreground">Os links das imagens valem por 5 minutos. Feche e abra de novo para renovar.</p>
        </div>
      )}
    </>
  );
}

function CorrectionForm({ stop, onDone }: { stop: SettlementStopDTO; onDone: () => void }) {
  const [cash, setCash] = useState(centsToInput(stop.proof?.cashCents ?? 0));
  const [pix, setPix] = useState(centsToInput(stop.proof?.pixCents ?? 0));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const cashCents = parseBRLToCents(cash);
        const pixCents = parseBRLToCents(pix);
        if (!cashCents.ok || !pixCents.ok) {
          setError(!cashCents.ok ? cashCents.error : !pixCents.ok ? pixCents.error : null);
          return;
        }
        startTransition(async () => {
          const result = await correctDeliveryPaymentAction({ orderId: stop.orderId, cashCents: cashCents.cents, pixCents: pixCents.cents, reason });
          if (result.ok) {
            toast.success(`Valores da parada ${stop.stopSequence} corrigidos.`);
            onDone();
          } else setError(result.fieldErrors?.reason ?? result.error);
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Corrigir valores · parada {stop.stopSequence}</DialogTitle>
        <DialogDescription>
          {stop.customerName} · a cobrar {formatCents(stop.amountToCollectCents)}. O desfecho e as quantidades não mudam. A correção fica na auditoria com o motivo.
        </DialogDescription>
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="correct-cash">Dinheiro (R$)</FieldLabel>
          <Input id="correct-cash" inputMode="decimal" value={cash} onChange={(event) => setCash(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="correct-pix">Pix (R$)</FieldLabel>
          <Input id="correct-pix" inputMode="decimal" value={pix} onChange={(event) => setPix(event.target.value)} />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="correct-reason">Motivo</FieldLabel>
        <Textarea id="correct-reason" rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          Salvar correção
        </Button>
      </DialogFooter>
    </form>
  );
}

function RescheduleForm({ stop, today, defaultDate, onDone }: { stop: SettlementStopDTO; today: string; defaultDate: string; onDone: () => void }) {
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await rescheduleOrderAction({ id: stop.orderId, deliveryDate: date });
          if (result.ok) {
            toast.success(`Pedido nº ${result.data.orderNumber} criado para ${formatDateString(date)}.`);
            onDone();
          } else setError(result.fieldErrors?.deliveryDate ?? result.error);
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Reagendar pedido nº {stop.orderNumber}</DialogTitle>
        <DialogDescription>Cria um pedido novo, pendente, com os mesmos itens e preços. O pedido original continua como não entregue.</DialogDescription>
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="settlement-reschedule-date">Nova data</FieldLabel>
        <Input id="settlement-reschedule-date" type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} />
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
