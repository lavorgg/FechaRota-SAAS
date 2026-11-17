// Cabeçalho comum aos dois romaneios (seção 5.6): empresa, código e versão da rota, data,
// motorista, veículo e placa, data e hora de geração. Fica dentro do <thead> da tabela
// principal para se repetir em toda página impressa.

import { DAY_OF_WEEK_LABELS, dayOfWeekOfDateString, formatDateString } from "@/domain/dates";
import { formatDocument } from "@/domain/document";
import type { ManifestHeader as Header } from "@/lib/services/manifests";

export function ManifestHeader({ header, title }: { header: Header; title: string }) {
  return (
    <div className="manifest-header">
      <div className="manifest-header__top">
        <div>
          <p className="manifest-company">{header.companyName}</p>
          {header.companyCnpj && <p>CNPJ {formatDocument(header.companyCnpj)}</p>}
        </div>
        <div className="manifest-header__title">
          <p className="manifest-title">{title}</p>
          <p>
            Rota <strong>{header.routeCode}</strong> · versão <strong>{header.routeVersion}</strong>
          </p>
          <p className="manifest-route-name">{header.routeName}</p>
        </div>
      </div>
      <dl className="manifest-facts">
        <div>
          <dt>Data de entrega</dt>
          <dd>
            {DAY_OF_WEEK_LABELS[dayOfWeekOfDateString(header.deliveryDate)]}, {formatDateString(header.deliveryDate)}
          </dd>
        </div>
        <div>
          <dt>Motorista</dt>
          <dd>{header.driverName}</dd>
        </div>
        <div>
          <dt>Veículo / placa</dt>
          <dd>{header.vehicle ? `${header.vehicle.model} · ${header.vehicle.plate}` : "—"}</dd>
        </div>
        <div>
          <dt>Gerado em</dt>
          <dd>{header.generatedAt}</dd>
        </div>
      </dl>
    </div>
  );
}
