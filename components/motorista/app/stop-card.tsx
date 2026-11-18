"use client";

// Card da parada (seção 5.7): tudo vem do IndexedDB, funciona sem sinal.

import { MapPinIcon, MessageCircleIcon, NavigationIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { arrivalMessage, googleMapsSearchUrl, wazeUrl, whatsappUrl } from "@/domain/driver-links";
import { formatPhoneBR } from "@/domain/normalize";
import { formatQuantity } from "@/domain/quantity";
import type { DriverStopDTO } from "@/lib/services/driver-routes";

import { PaymentBand } from "./payment-band";

export function StopCard({ stop, total, companyName }: { stop: DriverStopDTO; total: number; companyName: string }) {
  const place = { latitude: stop.latitude, longitude: stop.longitude, address: stop.addressLine };
  const whatsapp = whatsappUrl(stop.phone, arrivalMessage({ companyName, orderNumber: stop.orderNumber }));
  return (
    <article className="flex flex-col gap-4" aria-label={`Parada ${stop.stopSequence} de ${total}`}>
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium text-muted-foreground">
          Parada {stop.stopSequence} de {total} · pedido nº {stop.orderNumber}
          {stop.invoiceNumber ? ` · NF-e ${stop.invoiceNumber}` : ""}
        </p>
        <h1 className="text-2xl font-semibold">{stop.customerName}</h1>
      </div>

      <div className="flex flex-col gap-1 text-base">
        <p className="flex gap-2">
          <MapPinIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            {stop.addressLine}
            {stop.complement ? ` · ${stop.complement}` : ""}
          </span>
        </p>
        {stop.referencePoint && <p>Referência: {stop.referencePoint}</p>}
        <p>Janela de entrega: {stop.deliveryWindow ?? "não informada"}</p>
        {stop.phone && <p>Telefone: {formatPhoneBR(stop.phone)}</p>}
        {stop.notes && <p>Observações: {stop.notes}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button asChild className="h-12 text-base">
          <a href={googleMapsSearchUrl(place)} target="_blank" rel="noopener noreferrer">
            <NavigationIcon aria-hidden />
            Navegar
          </a>
        </Button>
        <Button asChild variant="outline" className="h-12 text-base">
          <a href={wazeUrl(place)} target="_blank" rel="noopener noreferrer">
            Waze
          </a>
        </Button>
        {whatsapp && (
          <Button asChild variant="outline" className="col-span-2 h-12 text-base">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircleIcon aria-hidden />
              WhatsApp
            </a>
          </Button>
        )}
      </div>

      <section aria-label="Itens do pedido" className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Itens</h2>
        <ul className="flex flex-col divide-y rounded-xl border">
          {stop.lines.map((line) => (
            <li key={line.orderItemId} className="flex items-baseline justify-between gap-3 px-3 py-2 text-base">
              <span>{line.productName}</span>
              <span className="font-semibold whitespace-nowrap tabular-nums">
                {formatQuantity(line.quantityMilli)} {line.unit}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <PaymentBand paymentMethod={stop.paymentMethod} amountCents={stop.amountToCollectCents} />

      <p className="text-base">
        <span className="font-semibold">Vasilhames com o cliente:</span>{" "}
        {stop.containerBalance.length === 0 ? "nenhum" : stop.containerBalance.map((line) => `${line.name}: ${line.balance}`).join(" · ")}
      </p>
    </article>
  );
}
