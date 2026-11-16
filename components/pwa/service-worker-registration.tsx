"use client";

import { useEffect } from "react";

import { DRIVER_SCOPE, SERVICE_WORKER_URL } from "@/lib/pwa/config";

/**
 * Registra o service worker da área do motorista.
 * Só em build de produção: em `next dev` ele fica desligado (seção 3.13).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: DRIVER_SCOPE, type: "module", updateViaCache: "none" })
      .catch(() => {
        // Sem service worker o app continua funcionando online. O aviso de "modo offline
        // indisponível" entra junto com a fila offline.
      });
  }, []);

  return null;
}
