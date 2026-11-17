import "@/components/romaneios/romaneio.css";

import type { Metadata } from "next";

import { ManifestHeader } from "@/components/romaneios/manifest-header";
import { NotPrintable, isNotPrintable } from "@/components/romaneios/not-printable";
import { PrintToolbar } from "@/components/romaneios/print-toolbar";
import { formatWeightKg } from "@/domain/cargo-manifest";
import { formatQuantity } from "@/domain/quantity";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { orNotFound } from "@/lib/page-helpers";
import { getCargoManifest } from "@/lib/services/manifests";


export const metadata: Metadata = { title: "Romaneio de carga" };

export default async function CargoManifestPage({ params }: PageProps<"/app/rotas/[id]/romaneio-carga">) {
  const session = await requirePagePermission("rotas.montar");
  const { id } = await params;
  const result = await orNotFound(getCargoManifest(serviceContext(session), id).catch(isNotPrintable));
  if (result === null) return <NotPrintable routeId={id} />;
  const { header, manifest } = result;

  return (
    <>
      <PrintToolbar backHref={`/app/rotas/${id}`} title="romaneio de carga" />
      <article className="manifest" aria-label="Romaneio de carga">
        <table className="manifest-sheet manifest-lines">
          <thead>
            <tr>
              <td colSpan={5} className="manifest-cell">
                <ManifestHeader header={header} title="Romaneio de carga" />
              </td>
            </tr>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col">Produto</th>
              <th scope="col">Un.</th>
              <th scope="col" className="num">
                Quantidade
              </th>
              <th scope="col" className="num">
                Peso
              </th>
            </tr>
          </thead>
          <tbody>
            {manifest.products.map((line) => (
              <tr key={line.productId}>
                <td>{line.sku}</td>
                <td>{line.productName}</td>
                <td>{line.unit}</td>
                <td className="num">{formatQuantity(line.quantityMilli)}</td>
                <td className="num">{line.weightGrams === null ? "sem peso" : formatWeightKg(line.weightGrams)}</td>
              </tr>
            ))}
            <tr className="manifest-total">
              <td colSpan={3}>
                Total · {manifest.orderCount} {manifest.orderCount === 1 ? "pedido" : "pedidos"}
              </td>
              <td className="num">{manifest.products.length} produtos</td>
              <td className="num">
                {formatWeightKg(manifest.totalWeightGrams)}
                {manifest.weightIncomplete ? " (peso incompleto)" : ""}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="manifest-cell">
                {manifest.weightIncomplete && <p className="manifest-note">Peso incompleto: há produto sem peso cadastrado; o total soma só os pesos conhecidos.</p>}
                <p className="manifest-section-title">Vasilhames a carregar</p>
                {manifest.containers.length === 0 ? (
                  <p>Nenhum vasilhame retornável nesta rota.</p>
                ) : (
                  <table className="manifest-lines">
                    <thead>
                      <tr>
                        <th scope="col">SKU</th>
                        <th scope="col">Vasilhame</th>
                        <th scope="col" className="num">
                          Quantidade
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {manifest.containers.map((container) => (
                        <tr key={container.productId}>
                          <td>{container.sku}</td>
                          <td>{container.name}</td>
                          <td className="num">{container.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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
