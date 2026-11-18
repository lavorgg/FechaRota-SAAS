"use client";

// Finalizar entrega (seção 5.7, "Comprovante"). Tudo funciona sem sinal: a confirmação grava
// no IndexedDB e a próxima parada aparece na hora; o envio vai pela fila.

import { CircleAlertIcon, ShieldCheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DELIVERY_OUTCOMES,
  DELIVERY_OUTCOME_LABELS,
  type DeliveryDraft,
  type DeliveryOutcome,
  type DraftErrors,
  FAILURE_REASONS,
  FAILURE_REASON_LABELS,
  type FailureReason,
  TEXT_LIMITS,
  containersForDelivery,
  deliveredQuantities,
  expectedCollectionCents,
  validateDeliveryDraft,
} from "@/domain/delivery";
import { centsToInput, formatCents, parseBRLToCents } from "@/domain/money";
import { PAYMENT_METHOD_LABELS, isCollectedOnDelivery } from "@/domain/payment";
import { formatQuantity, milliToInput, parseQuantityToMilli } from "@/domain/quantity";
import { isSignatureMeaningful } from "@/domain/signature";
import { currentPosition } from "@/lib/driver-app/geo";
import type { DriverRouteBundle, DriverStopDTO } from "@/lib/services/driver-routes";
import type { QueueFile } from "@/lib/driver-app/types";
import { cn } from "@/lib/utils";

import { useDriverApp } from "./context";
import { PaymentBand } from "./payment-band";
import { type Photo, PhotoPicker } from "./photo-picker";
import { SignaturePad, type SignatureValue, exportSignaturePng } from "./signature-pad";
import { Stepper } from "./stepper";

type ContainerState = Record<string, { delivered: number; returned: number }>;

function Section({ title, children, error, id }: { title: string; children: React.ReactNode; error?: string; id: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
      {error && (
        <p className="flex items-center gap-2 text-base text-destructive" role="alert">
          <CircleAlertIcon className="size-5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </section>
  );
}

export function DeliveryForm({ bundle, stop, onDone }: { bundle: DriverRouteBundle; stop: DriverStopDTO; onDone: () => void }) {
  const { store, engine } = useDriverApp();
  const lines = stop.lines;
  const collected = isCollectedOnDelivery(stop.paymentMethod);

  const [outcome, setOutcome] = useState<DeliveryOutcome | null>(null);
  const [delivered, setDelivered] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((line) => [line.orderItemId, line.quantityMilli])));
  const [kgText, setKgText] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => [line.orderItemId, milliToInput(line.quantityMilli)])));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [failureReason, setFailureReason] = useState<FailureReason | null>(null);
  const [failureNote, setFailureNote] = useState("");
  const [payment, setPayment] = useState<{ cash: string; pix: string } | null>(null);
  const [confirmDifferent, setConfirmDifferent] = useState(false);
  const [containers, setContainers] = useState<ContainerState | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverDocument, setReceiverDocument] = useState("");
  const [signature, setSignature] = useState<SignatureValue>({ strokes: [], width: 0, height: 0 });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);

  const deliveredMap = useMemo(
    () => deliveredQuantities({ outcome: outcome ?? "ENTREGUE", items: lines.map((line) => ({ orderItemId: line.orderItemId, deliveredMilli: delivered[line.orderItemId] ?? 0, returnReason: null })) }, lines),
    [outcome, delivered, lines],
  );
  const expected = expectedCollectionCents({ outcome: outcome ?? "ENTREGUE", paymentMethod: stop.paymentMethod, currentAmountCents: stop.amountToCollectCents, lines, delivered: deliveredMap });

  // Valor sugerido = valor a cobrar, no campo da forma de pagamento, até o motorista mexer.
  const suggested = { cash: stop.paymentMethod === "DINHEIRO" ? centsToInput(expected) : "0,00", pix: stop.paymentMethod === "PIX" ? centsToInput(expected) : "0,00" };
  const paymentText = payment ?? suggested;
  const cashParsed = paymentText.cash.trim() === "" ? { ok: true as const, cents: 0 } : parseBRLToCents(paymentText.cash);
  const pixParsed = paymentText.pix.trim() === "" ? { ok: true as const, cents: 0 } : parseBRLToCents(paymentText.pix);
  const receivedTotal = (cashParsed.ok ? cashParsed.cents : 0) + (pixParsed.ok ? pixParsed.cents : 0);
  const showPayment = outcome !== null && outcome !== "NAO_ENTREGUE" && collected;
  const differs = showPayment && receivedTotal !== expected;

  // Tipos de vasilhame: os que saem com os produtos e os que o cliente já tem.
  const containerTypes = useMemo(() => {
    const types = new Map<string, { productId: string; name: string; balance: number }>();
    for (const line of lines) if (line.container) types.set(line.container.productId, { productId: line.container.productId, name: line.container.name, balance: 0 });
    for (const balance of stop.containerBalance) types.set(balance.productId, { productId: balance.productId, name: balance.name, balance: balance.balance });
    return [...types.values()];
  }, [lines, stop.containerBalance]);
  const suggestedContainers: ContainerState = Object.fromEntries(
    containerTypes.map((type) => [type.productId, { delivered: outcome === "NAO_ENTREGUE" ? 0 : (containersForDelivery(lines, deliveredMap).find((line) => line.productId === type.productId)?.count ?? 0), returned: 0 }]),
  );
  const containerValues = containers ?? suggestedContainers;

  function setContainer(productId: string, field: "delivered" | "returned", value: number) {
    setContainers({ ...containerValues, [productId]: { ...(containerValues[productId] ?? { delivered: 0, returned: 0 }), [field]: value } });
  }

  async function confirm() {
    if (!outcome) {
      setErrors({ outcome: "Escolha o que aconteceu nesta parada." });
      return;
    }
    const nextErrors: DraftErrors = {};
    if (showPayment && (!cashParsed.ok || !pixParsed.ok)) nextErrors.payment = !cashParsed.ok ? cashParsed.error : pixParsed.ok ? undefined : pixParsed.error;
    const signed = outcome !== "NAO_ENTREGUE" && isSignatureMeaningful(signature.strokes);
    if (outcome !== "NAO_ENTREGUE" && signature.strokes.length > 0 && !signed) nextErrors.signature = "Assinatura muito curta. Limpe e peça para assinar de novo.";

    const draft: DeliveryDraft = {
      outcome,
      items: outcome === "ENTREGUE_PARCIAL" ? lines.map((line) => ({ orderItemId: line.orderItemId, deliveredMilli: delivered[line.orderItemId] ?? 0, returnReason: reasons[line.orderItemId]?.trim() || null })) : [],
      failureReason: outcome === "NAO_ENTREGUE" ? failureReason : null,
      failureNote: outcome === "NAO_ENTREGUE" ? failureNote.trim() || null : null,
      cashCents: showPayment && cashParsed.ok ? cashParsed.cents : 0,
      pixCents: showPayment && pixParsed.ok ? pixParsed.cents : 0,
      confirmDifferentAmount: confirmDifferent,
      containers: containerTypes.map((type) => ({ containerProductId: type.productId, delivered: outcome === "NAO_ENTREGUE" ? 0 : (containerValues[type.productId]?.delivered ?? 0), returned: containerValues[type.productId]?.returned ?? 0 })),
      receiverName: outcome === "NAO_ENTREGUE" ? null : receiverName.trim() || null,
      receiverDocument: outcome === "NAO_ENTREGUE" ? null : receiverDocument.trim() || null,
      hasSignature: signed,
      photoCount: photos.length,
    };
    const all = { ...validateDeliveryDraft(draft, { lines, paymentMethod: stop.paymentMethod, proofPolicy: bundle.company.proofPolicy, amountToCollectCents: stop.amountToCollectCents }), ...nextErrors };
    const found = Object.fromEntries(Object.entries(all).filter(([, message]) => Boolean(message)));
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => document.querySelector('[role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }

    setSaving(true);
    try {
      const files: QueueFile[] = [];
      if (signed) files.push({ kind: "SIGNATURE", contentType: "image/png", blob: await exportSignaturePng(signature.strokes, signature) });
      for (const photo of photos) files.push({ kind: "PHOTO", contentType: "image/jpeg", blob: photo.blob });
      const location = await currentPosition(5_000);
      const clientRequestId = crypto.randomUUID();
      const now = Date.now();
      await store.recordDelivery(
        { orderId: stop.orderId, routeId: bundle.route.id, outcome, clientRequestId, confirmedAt: now, synced: false },
        {
          clientRequestId,
          orderId: stop.orderId,
          routeId: bundle.route.id,
          createdAt: now,
          status: "pendente",
          attempts: 0,
          nextAttemptAt: 0,
          lastError: null,
          label: `Parada ${stop.stopSequence} · ${stop.customerName}`,
          payload: {
            clientRequestId,
            orderId: stop.orderId,
            outcome,
            deliveredAt: new Date(now).toISOString(),
            items: draft.items.map((item) => ({ orderItemId: item.orderItemId, deliveredMilli: item.deliveredMilli, returnReason: item.returnReason })),
            failureReason: draft.failureReason,
            failureNote: draft.failureNote,
            cashCents: draft.cashCents,
            pixCents: draft.pixCents,
            confirmDifferentAmount: draft.confirmDifferentAmount,
            containers: draft.containers.map((container) => ({ ...container })),
            receiverName: draft.receiverName,
            receiverDocument: draft.receiverDocument,
            location,
          },
          files,
          uploaded: null,
        },
      );
      await engine.refresh();
      void engine.run(true);
      toast.success(`Parada ${stop.stopSequence} registrada.`);
      onDone();
    } catch (reason) {
      setErrors({ save: reason instanceof Error ? reason.message : "Não foi possível guardar a entrega no celular." });
      setSaving(false);
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="text-base text-muted-foreground">
          Parada {stop.stopSequence} · pedido nº {stop.orderNumber}
        </p>
        <h1 className="text-2xl font-semibold">{stop.customerName}</h1>
      </div>

      {errorCount > 0 && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertDescription className="text-base">{errors.save ?? "Confira os itens destacados antes de confirmar."}</AlertDescription>
        </Alert>
      )}

      <Section id="desfecho" title="1. O que aconteceu?" error={errors.outcome}>
        <div className="grid gap-2" role="radiogroup" aria-labelledby="desfecho">
          {DELIVERY_OUTCOMES.map((option) => (
            <Button
              key={option}
              type="button"
              role="radio"
              aria-checked={outcome === option}
              variant={outcome === option ? "default" : "outline"}
              className="h-14 justify-start text-lg"
              onClick={() => {
                setOutcome(option);
                setErrors({});
              }}
            >
              {DELIVERY_OUTCOME_LABELS[option]}
            </Button>
          ))}
        </div>
      </Section>

      {outcome === "ENTREGUE_PARCIAL" && (
        <Section id="itens" title="2. Quanto foi entregue de cada item" error={errors.items}>
          <ul className="flex flex-col gap-4">
            {lines.map((line) => {
              const value = delivered[line.orderItemId] ?? 0;
              const returned = value < line.quantityMilli;
              return (
                <li key={line.orderItemId} className="flex flex-col gap-2 rounded-xl border p-3">
                  <p className="font-medium">
                    {line.productName} <span className="text-muted-foreground">· pedido: {formatQuantity(line.quantityMilli)} {line.unit}</span>
                  </p>
                  {line.unit === "KG" ? (
                    <Input
                      inputMode="decimal"
                      className="h-12 text-lg"
                      aria-label={`Quilos entregues de ${line.productName}`}
                      value={kgText[line.orderItemId] ?? ""}
                      onChange={(event) => {
                        setKgText({ ...kgText, [line.orderItemId]: event.target.value });
                        const parsed = event.target.value.trim() === "" || event.target.value.trim() === "0" ? { ok: true as const, milli: 0 } : parseQuantityToMilli(event.target.value);
                        setDelivered({ ...delivered, [line.orderItemId]: parsed.ok ? parsed.milli : -1 });
                      }}
                    />
                  ) : (
                    <Stepper
                      label={`Entregue de ${line.productName}`}
                      value={value}
                      step={1000}
                      max={line.quantityMilli}
                      format={(milli) => `${formatQuantity(milli)} ${line.unit}`}
                      onChange={(milli) => setDelivered({ ...delivered, [line.orderItemId]: milli })}
                    />
                  )}
                  {errors[`item-${line.orderItemId}`] && <p className="text-destructive" role="alert">{errors[`item-${line.orderItemId}`]}</p>}
                  {returned && (
                    <>
                      <Input
                        className="h-12 text-base"
                        placeholder="Motivo da devolução"
                        aria-label={`Motivo da devolução de ${line.productName}`}
                        maxLength={TEXT_LIMITS.returnReason}
                        value={reasons[line.orderItemId] ?? ""}
                        onChange={(event) => setReasons({ ...reasons, [line.orderItemId]: event.target.value })}
                        aria-invalid={Boolean(errors[`reason-${line.orderItemId}`])}
                      />
                      {errors[`reason-${line.orderItemId}`] && <p className="text-destructive" role="alert">{errors[`reason-${line.orderItemId}`]}</p>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-base">
            Valor dos itens entregues: <strong>{formatCents(expected)}</strong>
            {!collected && " (faturado, não cobrar)"}
          </p>
        </Section>
      )}

      {outcome === "NAO_ENTREGUE" && (
        <Section id="motivo" title="2. Por que não foi entregue?" error={errors.failureReason}>
          <div className="grid gap-2" role="radiogroup" aria-labelledby="motivo">
            {FAILURE_REASONS.map((reason) => (
              <Button key={reason} type="button" role="radio" aria-checked={failureReason === reason} variant={failureReason === reason ? "default" : "outline"} className="h-12 justify-start text-base" onClick={() => setFailureReason(reason)}>
                {FAILURE_REASON_LABELS[reason]}
              </Button>
            ))}
          </div>
          <Textarea className="min-h-20 text-base" placeholder="Observação (opcional)" aria-label="Observação" maxLength={TEXT_LIMITS.failureNote} value={failureNote} onChange={(event) => setFailureNote(event.target.value)} />
        </Section>
      )}

      {outcome !== null && outcome !== "NAO_ENTREGUE" && (
        <Section id="recebimento" title="Recebimento" error={errors.payment}>
          <PaymentBand paymentMethod={stop.paymentMethod} amountCents={expected} />
          {collected && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-base">
                  Dinheiro (R$)
                  <Input inputMode="decimal" className="h-12 text-lg" value={paymentText.cash} onChange={(event) => setPayment({ ...paymentText, cash: event.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-base">
                  Pix (R$)
                  <Input inputMode="decimal" className="h-12 text-lg" value={paymentText.pix} onChange={(event) => setPayment({ ...paymentText, pix: event.target.value })} />
                </label>
              </div>
              {differs && (
                <label className="flex items-start gap-3 rounded-xl border-2 border-amber-600 bg-amber-50 p-3 text-base text-amber-950">
                  <Checkbox className="mt-0.5 size-6" checked={confirmDifferent} onCheckedChange={(checked) => setConfirmDifferent(checked === true)} />
                  <span>
                    Confirmo que recebi {formatCents(receivedTotal)}, diferente do esperado ({formatCents(expected)} em {PAYMENT_METHOD_LABELS[stop.paymentMethod]}).
                  </span>
                </label>
              )}
            </>
          )}
        </Section>
      )}

      {outcome !== null && containerTypes.length > 0 && (
        <Section id="vasilhames" title="Vasilhames" error={errors.containers}>
          <ul className="flex flex-col gap-3">
            {containerTypes.map((type) => (
              <li key={type.productId} className="flex flex-col gap-2 rounded-xl border p-3">
                <p className="font-medium">
                  {type.name} <span className="text-muted-foreground">· com o cliente antes: {type.balance}</span>
                </p>
                {outcome !== "NAO_ENTREGUE" && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Deixados</span>
                    <Stepper label={`${type.name} deixados`} value={containerValues[type.productId]?.delivered ?? 0} onChange={(value) => setContainer(type.productId, "delivered", value)} />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Recolhidos</span>
                  <Stepper label={`${type.name} recolhidos`} value={containerValues[type.productId]?.returned ?? 0} onChange={(value) => setContainer(type.productId, "returned", value)} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {outcome !== null && outcome !== "NAO_ENTREGUE" && (
        <Section id="recebedor" title="Quem recebeu" error={errors.receiverName ?? errors.receiverDocument}>
          <Input className="h-12 text-lg" placeholder="Nome legível" aria-label="Nome de quem recebeu" autoComplete="off" maxLength={TEXT_LIMITS.receiverName} value={receiverName} onChange={(event) => setReceiverName(event.target.value)} aria-invalid={Boolean(errors.receiverName)} />
          <Input className="h-12 text-lg" placeholder="Documento (opcional)" aria-label="Documento de quem recebeu (opcional)" autoComplete="off" maxLength={TEXT_LIMITS.receiverDocument} value={receiverDocument} onChange={(event) => setReceiverDocument(event.target.value)} />
        </Section>
      )}

      {outcome !== null && outcome !== "NAO_ENTREGUE" && (
        <Section id="assinatura" title={bundle.company.proofPolicy === "SIGNATURE_REQUIRED" ? "Assinatura (obrigatória)" : "Assinatura"} error={errors.signature}>
          <SignaturePad value={signature} onChange={setSignature} invalid={Boolean(errors.signature)} />
        </Section>
      )}

      {outcome !== null && (
        <Section id="fotos" title="Fotos (até 3)" error={errors.photos}>
          <PhotoPicker photos={photos} onChange={setPhotos} hint={outcome === "NAO_ENTREGUE" ? "Foto recomendada: mostre o local fechado ou o motivo." : undefined} />
        </Section>
      )}

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheckIcon className="size-4 shrink-0" aria-hidden />
        Os dados são usados para comprovar a entrega.
      </p>

      <div className={cn("sticky bottom-0 -mx-4 border-t bg-background px-4 py-3")}>
        <Button type="submit" className="h-14 w-full text-lg" disabled={saving || outcome === null}>
          {saving ? "Guardando..." : "Confirmar entrega"}
        </Button>
      </div>
    </form>
  );
}
