"use client";

// Fila de envio (seção 5.7, passos 3 a 5): situação, "Sincronizar agora" e "Precisa de atenção".
// Nada é descartado sem o motorista pedir.

import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/lista/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatInstant } from "@/domain/dates";
import type { QueueRecord } from "@/lib/driver-app/types";

import { useDriverApp, useSyncState } from "./context";
import { syncSummary } from "./sync-indicator";
import { hrefFor } from "./use-hash-route";

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function QueueView() {
  const { store, engine } = useDriverApp();
  const state = useSyncState();
  const [records, setRecords] = useState<QueueRecord[]>([]);
  const [discarding, setDiscarding] = useState<QueueRecord | null>(null);

  useEffect(() => {
    let active = true;
    void store.listQueue().then((list) => {
      if (active) setRecords(list.sort((a, b) => a.createdAt - b.createdAt));
    });
    return () => {
      active = false;
    };
  }, [store, state.pending, state.attention, state.running]);

  const pending = records.filter((record) => record.status === "pendente");
  const attention = records.filter((record) => record.status === "atencao");

  return (
    <div className="flex flex-col gap-5">
      <a href={hrefFor({ name: "inicio" })} className="inline-flex min-h-12 items-center gap-1 text-base text-muted-foreground">
        <ArrowLeftIcon className="size-5" aria-hidden />
        Rotas de hoje
      </a>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Envio das entregas</h1>
        <p className="text-base">{syncSummary(state)}</p>
        <p className="text-base text-muted-foreground">{state.lastSyncAt ? `Última sincronização: ${formatInstant(new Date(state.lastSyncAt), tz())}` : "Nenhuma sincronização ainda."}</p>
      </div>
      {state.sessionExpired && (
        <Alert>
          <AlertDescription className="text-base">
            Sua sessão expirou. As entregas continuam guardadas neste celular.{" "}
            <a className="font-semibold underline" href="/login?proximo=%2Fmotorista">
              Entrar de novo
            </a>
          </AlertDescription>
        </Alert>
      )}
      <Button className="h-12 text-base" disabled={state.running || !state.online || pending.length === 0} onClick={() => void engine.run(true)}>
        <RefreshCwIcon className={state.running ? "animate-spin" : undefined} aria-hidden />
        {state.running ? "Enviando..." : "Sincronizar agora"}
      </Button>
      {!state.online && <p className="text-base text-muted-foreground">Sem conexão. O envio começa sozinho quando o sinal voltar.</p>}

      {pending.length > 0 && (
        <section aria-labelledby="aguardando" className="flex flex-col gap-2">
          <h2 id="aguardando" className="text-lg font-semibold">
            Aguardando envio
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((record) => (
              <li key={record.clientRequestId} className="rounded-xl border p-3 text-base">
                <p className="font-medium">{record.label}</p>
                {record.lastError && <p className="text-muted-foreground">Última tentativa: {record.lastError}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {attention.length > 0 && (
        <section aria-labelledby="atencao" className="flex flex-col gap-2">
          <h2 id="atencao" className="text-lg font-semibold text-destructive">
            Precisa de atenção
          </h2>
          <p className="text-base text-muted-foreground">O servidor recusou estas entregas. Elas continuam guardadas aqui. Fale com o escritório se o problema continuar.</p>
          <ul className="flex flex-col gap-2">
            {attention.map((record) => (
              <li key={record.clientRequestId} className="flex flex-col gap-2 rounded-xl border-2 border-destructive p-3 text-base">
                <p className="font-medium">{record.label}</p>
                <p>{record.lastError}</p>
                <div className="flex flex-wrap gap-2">
                  <Button className="h-12" onClick={() => void engine.retry(record.clientRequestId)} disabled={!state.online}>
                    Tentar de novo
                  </Button>
                  <Button variant="outline" className="h-12" onClick={() => setDiscarding(record)}>
                    Descartar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={discarding !== null}
        onOpenChange={(open) => !open && setDiscarding(null)}
        title="Descartar esta entrega?"
        description={`${discarding?.label ?? ""}: ela NÃO foi registrada no sistema. A parada volta a ficar aberta neste celular. Avise o escritório.`}
        confirmLabel="Descartar"
        onConfirm={() => {
          if (discarding) void engine.discard(discarding.clientRequestId);
          setDiscarding(null);
        }}
      />
    </div>
  );
}
