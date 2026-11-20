import "@/components/romaneios/romaneio.css";

import type { Metadata } from "next";

import { ManifestHeader } from "@/components/romaneios/manifest-header";
import { PrintToolbar } from "@/components/romaneios/print-toolbar";
import { DELIVERY_OUTCOME_LABELS, FAILURE_REASON_LABELS } from "@/domain/delivery";
import { formatCents } from "@/domain/money";
import { ORDER_STATUS_LABELS } from "@/domain/order-status";
import { formatQuantity } from "@/domain/quantity";
import { differenceLabel } from "@/domain/settlement";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { orNotFound } from "@/lib/page-helpers";
import { getSettlement } from "@/lib/services/settlement";

export const metadata: Metadata = { title: "Resumo do acerto" };

// Resumo de acerto imprimível em A4 (seção 5.8). Antes da conclusão sai marcado como prévia.
export default async function SettlementSummaryPage({ params }: PageProps<"/app/rotas/[id]/fechamento/resumo">) {
  const session = await requirePagePermission("acerto.realizar");
  const { id } = await params;
  const data = await orNotFound(getSettlement(serviceContext(session), id));
  const { route, settlement, stops } = data;
  const money = settlement.money;
  const concluded = route.status === "CONCLUIDA";

  return (
    <>
      <PrintToolbar backHref={`/app/rotas/${id}/fechamento`} title="resumo do acerto" />
      <article className="manifest" aria-label="Resumo do acerto">
        <table className="manifest-sheet">
          <thead>
            <tr>
              <td>
                <ManifestHeader
                  title="Resumo do acerto"
                  header={{
                    companyName: data.companyName,
                    companyCnpj: data.companyCnpj,
                    routeCode: route.code,
                    routeName: route.name,
                    routeVersion: route.version,
                    routeStatus: route.status,
                    deliveryDate: route.deliveryDate,
                    driverName: route.driverName,
                    vehicle: route.vehicle,
                    generatedAt: data.generatedAt,
                  }}
                />
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="manifest-cell">
                <p className="manifest-section-title" style={{ marginTop: 0 }}>
                  {concluded ? `Acerto concluído em ${route.closedAt} por ${route.closedByName}` : "PRÉVIA — acerto ainda não concluído"}
                </p>

                <p className="manifest-section-title">Dinheiro</p>
                <table className="manifest-lines">
                  <tbody>
                    <tr><td>Esperado (pedidos entregues)</td><td className="num">{formatCents(money.expectedCents)}</td></tr>
                    <tr><td>Recebido em dinheiro</td><td className="num">{formatCents(money.cashCents)}</td></tr>
                    <tr><td>Pix informado</td><td className="num">{formatCents(money.pixInformedCents)}</td></tr>
                    <tr><td>Pix conferido no extrato</td><td className="num">{formatCents(money.pixConfirmedCents)}</td></tr>
                    <tr><td>Pix a conferir</td><td className="num">{formatCents(money.pixPendingCents)}</td></tr>
                    <tr><td>Dinheiro entregue no caixa</td><td className="num">{money.cashHandedInCents === null ? "—" : formatCents(money.cashHandedInCents)}</td></tr>
                    <tr className="manifest-total"><td>Sobra / falta (caixa − (esperado − Pix informado))</td><td className="num">{money.differenceCents === null ? "—" : differenceLabel(money.differenceCents)}</td></tr>
                  </tbody>
                </table>

                <p className="manifest-section-title">Mercadoria</p>
                <table className="manifest-lines">
                  <thead>
                    <tr><th scope="col">SKU</th><th scope="col">Produto</th><th scope="col" className="num">Carregado</th><th scope="col" className="num">Entregue</th><th scope="col" className="num">Devolvido</th></tr>
                  </thead>
                  <tbody>
                    {settlement.goods.map((line) => (
                      <tr key={line.productId}>
                        <td>{line.sku}</td>
                        <td>{line.productName}</td>
                        <td className="num">{formatQuantity(line.loadedMilli)} {line.unit}</td>
                        <td className="num">{formatQuantity(line.deliveredMilli)} {line.unit}</td>
                        <td className="num">{line.returnedMilli > 0 ? <strong>{formatQuantity(line.returnedMilli)} {line.unit}</strong> : `0 ${line.unit}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {settlement.containers.length > 0 && (
                  <>
                    <p className="manifest-section-title">Vasilhames</p>
                    <table className="manifest-lines">
                      <thead>
                        <tr><th scope="col">Vasilhame</th><th scope="col" className="num">Saíram</th><th scope="col" className="num">Deixados</th><th scope="col" className="num">Recolhidos</th><th scope="col" className="num">Voltam</th><th scope="col" className="num">Saldo com clientes</th></tr>
                      </thead>
                      <tbody>
                        {settlement.containers.map((line) => (
                          <tr key={line.productId}>
                            <td>{line.name}</td>
                            <td className="num">{line.out}</td>
                            <td className="num">{line.left}</td>
                            <td className="num">{line.collected}</td>
                            <td className="num">{line.backToDepot}</td>
                            <td className="num">{line.withCustomers}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                <p className="manifest-section-title">Paradas</p>
                <table className="manifest-lines">
                  <thead>
                    <tr><th scope="col">Parada</th><th scope="col">Cliente</th><th scope="col">Desfecho</th><th scope="col" className="num">A cobrar</th><th scope="col" className="num">Dinheiro</th><th scope="col" className="num">Pix</th></tr>
                  </thead>
                  <tbody>
                    {stops.map((stop) => (
                      <tr key={stop.orderId}>
                        <td>{stop.stopSequence} · nº {stop.orderNumber}</td>
                        <td>{stop.customerName}</td>
                        <td>
                          {stop.proof ? DELIVERY_OUTCOME_LABELS[stop.proof.outcome] : ORDER_STATUS_LABELS[stop.status]}
                          {stop.proof?.failureReason ? ` (${FAILURE_REASON_LABELS[stop.proof.failureReason]})` : ""}
                          {stop.rescheduledToNumber ? ` · reagendado no nº ${stop.rescheduledToNumber}` : ""}
                        </td>
                        <td className="num">{formatCents(stop.status === "NAO_ENTREGUE" ? 0 : stop.amountToCollectCents)}</td>
                        <td className="num">{formatCents(stop.proof?.cashCents ?? 0)}</td>
                        <td className="num">
                          {formatCents(stop.proof?.pixCents ?? 0)}
                          {stop.paymentStatus === "PIX_A_CONFERIR" ? " (a conferir)" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="manifest-signatures">
                  <p className="manifest-signature">Conferente: nome e assinatura</p>
                  <p className="manifest-signature">Motorista: nome e assinatura</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </>
  );
}
