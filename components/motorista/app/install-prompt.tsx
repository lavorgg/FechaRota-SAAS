"use client";

// Instalação (seção 5.7): no Android, o botão "Instalar aplicativo" (beforeinstallprompt); no
// iPhone, instruções; aberto pelo navegador, aviso permanente de que o offline só é confiável
// com o app instalado.

import { DownloadIcon, ShareIcon, SquarePlusIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import { hrefFor } from "./use-hash-route";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function subscribeStandalone(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function useStandalone(): boolean {
  return useSyncExternalStore(subscribeStandalone, isStandalone, () => true);
}

export function InstallPrompt() {
  const standalone = useStandalone();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const ios = useSyncExternalStore(
    () => () => {},
    isIos,
    () => false,
  );

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-600 bg-amber-50 p-4 text-amber-950" role="note" data-testid="aviso-instalacao">
      <p className="flex items-start gap-2 text-base font-medium">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
        Sem instalar, o modo offline não é confiável: o celular pode apagar a rota salva. Instale o app na tela inicial.
      </p>
      {installEvent ? (
        <Button
          className="h-12 self-start text-base"
          onClick={() => {
            void installEvent.prompt();
            void installEvent.userChoice.finally(() => setInstallEvent(null));
          }}
        >
          <DownloadIcon aria-hidden />
          Instalar aplicativo
        </Button>
      ) : ios ? (
        <Button asChild variant="outline" className="h-12 self-start bg-white text-base">
          <a href={hrefFor({ name: "instalar" })}>Como instalar no iPhone</a>
        </Button>
      ) : null}
    </div>
  );
}

export function IosInstallInstructions() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Instalar no iPhone</h1>
      <p className="text-base">O iPhone não mostra um botão de instalar. Faça assim, no Safari:</p>
      <ol className="flex flex-col gap-4 text-base">
        <li className="flex items-center gap-4 rounded-xl border p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2">
            <ShareIcon className="size-6" aria-hidden />
          </span>
          <span>
            <strong>1.</strong> Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima, na barra de baixo).
          </span>
        </li>
        <li className="flex items-center gap-4 rounded-xl border p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2">
            <SquarePlusIcon className="size-6" aria-hidden />
          </span>
          <span>
            <strong>2.</strong> Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.
          </span>
        </li>
        <li className="flex items-center gap-4 rounded-xl border p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 text-lg font-bold">FR</span>
          <span>
            <strong>3.</strong> Toque em <strong>Adicionar</strong> e abra o app pelo ícone <strong>FechaRota</strong>. Entre de novo com seu e-mail e senha.
          </span>
        </li>
      </ol>
      <Button asChild variant="outline" className="h-12 self-start text-base">
        <a href={hrefFor({ name: "inicio" })}>Voltar</a>
      </Button>
    </div>
  );
}
