"use client";

// Navegação dentro do app do motorista pelo "#": trocar de tela não faz requisição nenhuma,
// então funciona igual sem sinal, e o botão "voltar" do Android continua funcionando.

import { useSyncExternalStore } from "react";

export type DriverView =
  | { name: "inicio" }
  | { name: "rota"; routeId: string }
  | { name: "parada"; routeId: string; orderId: string }
  | { name: "entrega"; routeId: string; orderId: string }
  | { name: "fila" }
  | { name: "instalar" };

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function parseHash(hash: string): DriverView {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "fila") return { name: "fila" };
  if (parts[0] === "instalar") return { name: "instalar" };
  if (parts[0] === "rota" && parts[1]) {
    if (parts[2] === "parada" && parts[3]) return parts[4] === "entrega" ? { name: "entrega", routeId: parts[1], orderId: parts[3] } : { name: "parada", routeId: parts[1], orderId: parts[3] };
    return { name: "rota", routeId: parts[1] };
  }
  return { name: "inicio" };
}

export function hrefFor(view: DriverView): string {
  switch (view.name) {
    case "inicio":
      return "#/";
    case "fila":
      return "#/fila";
    case "instalar":
      return "#/instalar";
    case "rota":
      return `#/rota/${encodeURIComponent(view.routeId)}`;
    case "parada":
      return `#/rota/${encodeURIComponent(view.routeId)}/parada/${encodeURIComponent(view.orderId)}`;
    case "entrega":
      return `#/rota/${encodeURIComponent(view.routeId)}/parada/${encodeURIComponent(view.orderId)}/entrega`;
  }
}

export function navigate(view: DriverView, options: { replace?: boolean } = {}): void {
  const href = hrefFor(view);
  if (options.replace) window.location.replace(href);
  else window.location.hash = href;
}

export function useDriverView(): DriverView {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return parseHash(hash);
}
