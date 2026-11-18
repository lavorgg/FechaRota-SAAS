"use client";

// Registra o service worker da área do motorista (seção 3.13) e avisa quando há versão nova:
// "Nova versão disponível — Atualizar". Nunca recarrega sozinho: o motorista pode estar no meio
// de uma entrega. Em `next dev` o service worker fica desligado.

import { RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DRIVER_SCOPE, SERVICE_WORKER_URL } from "@/lib/pwa/config";

export function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    let reloading = false;

    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        // "installed" com outro worker no controle = versão nova esperando.
        if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
      };
      check();
      worker.addEventListener("statechange", check);
    };
    const onControllerChange = () => {
      if (!reloading) return;
      window.location.reload();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    };

    navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: DRIVER_SCOPE, type: "module", updateViaCache: "none" })
      .then((value) => {
        registration = value;
        track(value.waiting);
        value.addEventListener("updatefound", () => track(value.installing));
      })
      .catch(() => {
        // Sem service worker o app continua funcionando online.
      });
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    (window as Window & { __fecharotaUpdate?: () => void }).__fecharotaUpdate = () => {
      reloading = true;
    };
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center justify-between gap-3 rounded-xl border bg-background p-3 shadow-lg">
      <span className="text-base font-medium">Nova versão disponível</span>
      <Button
        className="h-12 text-base"
        onClick={() => {
          (window as Window & { __fecharotaUpdate?: () => void }).__fecharotaUpdate?.();
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        <RefreshCwIcon aria-hidden />
        Atualizar
      </Button>
    </div>
  );
}
