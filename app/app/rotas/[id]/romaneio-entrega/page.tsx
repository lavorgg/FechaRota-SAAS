import "@/components/romaneios/romaneio.css";

import type { Metadata } from "next";

import { ManifestHeader } from "@/components/romaneios/manifest-header";
import { NotPrintable, isNotPrintable } from "@/components/romaneios/not-printable";
import { PrintToolbar } from "@/components/romaneios/print-toolbar";
import { formatCents } from "@/domain/money";
import { formatPhoneBR } from "@/domain/normalize";
import { PAYMENT_METHOD_LABELS, isCollectedOnDelivery } from "@/domain/payment";
import { formatQuantity } from "@/domain/quantity";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { orNotFound } from "@/lib/page-helpers";
import { type DeliveryStopDTO, getDeliveryManifest } from "@/lib/services/manifests";

export const metadata: Metadata = { title: "Romaneio de entrega" };

export default async function DeliveryManifestPage({ params }: PageProps<"/app/rotas/[id]/romaneio-entrega">) {
  const session = await requirePagePermission("rotas.montar");
  const { id } = await params;
  const result = await orNotFound(getDeliveryManifest(serviceContext(session), id).catch(isNotPrintable));
  if (result === null) return <NotPrintable routeId={id} />;
  const { header, stops } = result;

  return (
    <>
      <PrintToolbar backHref={`/app/rotas/${id}`} title="romaneio de entrega" />
      <article className="manifest" aria-label="Romaneio de entrega">
        <table className="manifest-sheet">
          <thead>
            <tr>
              <td>
                <ManifestHeader header={header} title="Romaneio de entrega" />
              </td>
            </tr>
          </thead>
          <tbody>
            {stops.map((stop) => (
              <tr key={stop.orderNumber} className="manifest-stop">
                <td>
                  <Stop stop={stop} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}

function Stop({ stop }: { stop: DeliveryStopDTO }) {
  const collect = isCollectedOnDelivery(stop.paymentMethod);
  return (
    <section className="stop-card" aria-label={`Parada ${stop.stopSequence}`}>
      <div className="stop-card__head">
        <p>
          <span className="stop-number">Parada {stop.stopSequence}</span> · <span className="stop-customer">{stop.customerName}</span>
        </p>
        <p>
          Pedido nº <strong>{stop.orderNumber}</strong>
          {stop.invoiceNumber && (
            <>
              {" "}
              · NF-e <strong>{stop.invoiceNumber}</strong>
            </>
          )}
        </p>
      </div>
      <div className="stop-grid">
        <div>
          <p>
            <span className="stop-label">Endereço:</span> {stop.addressLine}
            {stop.complement ? ` · ${stop.complement}` : ""}
          </p>
          {stop.referencePoint && (
            <p>
              <span className="stop-label">Referência:</span> {stop.referencePoint}
            </p>
          )}
          <p>
            <span className="stop-label">Telefone:</span> {stop.phone ? formatPhoneBR(stop.phone) : "—"} · <span className="stop-label">Janela:</span> {stop.deliveryWindow ?? "—"}
          </p>
          {stop.notes && (
            <p>
              <span className="stop-label">Observações:</span> {stop.notes}
            </p>
          )}
          <table className="stop-items">
            <thead>
              <tr>
                <th scope="col" className="num">
                  Qtd.
                </th>
                <th scope="col">Un.</th>
                <th scope="col">Produto</th>
              </tr>
            </thead>
            <tbody>
              {stop.items.map((item, index) => (
                <tr key={index}>
                  <td className="num">{formatQuantity(item.quantityMilli)}</td>
                  <td>{item.unit}</td>
                  <td>{item.productName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="stop-pay">
            {collect ? (
              <>
                <p>Cobrar ({PAYMENT_METHOD_LABELS[stop.paymentMethod]})</p>
                <p className="stop-pay__amount">{formatCents(stop.amountToCollectCents)}</p>
              </>
            ) : (
              <>
                <p className="stop-pay__amount">{PAYMENT_METHOD_LABELS[stop.paymentMethod].toUpperCase()} — não cobrar</p>
                <p>Total do pedido: {formatCents(stop.totalCents)}</p>
              </>
            )}
          </div>
          <p className="manifest-note">
            <span className="stop-label">Saldo de vasilhames:</span>{" "}
            {stop.containerBalance.length === 0 ? "nenhum com o cliente" : stop.containerBalance.map((line) => `${line.name}: ${line.balance}`).join(" · ")}
          </p>
        </div>
      </div>
      <div className="stop-receipt">
        <p className="manifest-signature">Recebido por (nome legível)</p>
        <p className="manifest-signature">Assinatura</p>
      </div>
    </section>
  );
}
