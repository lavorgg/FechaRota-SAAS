"use client";

// App do motorista (seção 5.7). A página que o servidor entrega não tem nenhum dado do
// usuário: tudo vem da API (online) ou do IndexedDB (sem sinal). Assim o service worker pode
// guardar a página para abrir offline sem guardar dado de negócio (seção 3.13).

import { LogOutIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { logoutAction } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchToday } from "@/lib/driver-app/api";
import { DriverStore, forgetUser, rememberUser, rememberedUser } from "@/lib/driver-app/db";
import { SyncEngine } from "@/lib/driver-app/sync-engine";
import type { DriverUser } from "@/lib/driver-app/types";

import { DriverAppContext, type DriverAppValue, useDriverApp, useSyncState } from "./context";
import { HomeView } from "./home-view";
import { IosInstallInstructions } from "./install-prompt";
import { QueueView } from "./queue-view";
import { RouteView } from "./route-view";
import { SyncIndicator } from "./sync-indicator";
import { useDriverView } from "./use-hash-route";

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

type Phase = { kind: "carregando" } | { kind: "sem-usuario" } | { kind: "pronto"; value: DriverAppValue };

export function DriverApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "carregando" });

  useEffect(() => {
    let active = true;
    let opened: DriverAppValue | null = null;
    void (async () => {
      // Pede ao navegador para não apagar o IndexedDB (no iOS só vale com o app instalado).
      void navigator.storage?.persist?.().catch(() => false);
      const response = await fetchToday();
      let user: DriverUser | null;
      if (response.ok) {
        user = { ...response.data.user, companyName: response.data.companyName };
        rememberUser(user);
      } else if (response.status === 401) {
        // Carregamento completo: o login fica fora do escopo do service worker.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navegação completa proposital
        window.location.assign("/login?proximo=%2Fmotorista");
        return;
      } else {
        user = rememberedUser();
      }
      if (!user) {
        if (active) setPhase({ kind: "sem-usuario" });
        return;
      }
      const store = await DriverStore.open(user.id);
      if (response.ok) await store.saveToday({ date: response.data.date, routes: response.data.routes, fetchedAt: Date.now() });
      const engine = new SyncEngine(store);
      opened = { user, store, engine };
      if (!active) {
        store.close();
        return;
      }
      engine.start();
      setPhase({ kind: "pronto", value: opened });
    })();
    return () => {
      active = false;
      opened?.engine.stop();
      opened?.store.close();
    };
  }, []);

  if (phase.kind === "carregando") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
        <p className="text-base text-muted-foreground">Abrindo...</p>
      </main>
    );
  }
  if (phase.kind === "sem-usuario") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
        <Alert>
          <WifiOffIcon aria-hidden />
          <AlertDescription className="text-base">Sem conexão. Abra o app com internet uma vez para baixar a rota; depois ele funciona sem sinal.</AlertDescription>
        </Alert>
      </main>
    );
  }
  return (
    <DriverAppContext.Provider value={phase.value}>
      <Shell />
    </DriverAppContext.Provider>
  );
}

function Shell() {
  const { user } = useDriverApp();
  const view = useDriverView();
  const sync = useSyncState();

  // Seção 5.7, passo 6: avisa antes de fechar com entrega guardada e não enviada.
  useEffect(() => {
    if (sync.pending === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [sync.pending]);

  return (
    <>
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{user.name}</span>
          <span className="truncate text-sm text-muted-foreground">{user.companyName}</span>
        </div>
      </header>
      <div className="sticky top-0 z-20 bg-background">
        <SyncIndicator timeZone={deviceTimeZone()} />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
        {view.name === "inicio" && <HomeView />}
        {view.name === "fila" && <QueueView />}
        {view.name === "instalar" && <IosInstallInstructions />}
        {(view.name === "rota" || view.name === "parada" || view.name === "entrega") && (
          <RouteView key={view.routeId} routeId={view.routeId} orderId={view.name === "rota" ? null : view.orderId} finishing={view.name === "entrega"} />
        )}
      </main>
      <footer className="flex justify-end border-t bg-background px-4 py-3">
        <LogoutButton />
      </footer>
    </>
  );
}

/** Celular compartilhado: sair apaga a rota e a fila deste usuário. Com entrega não enviada, não sai. */
function LogoutButton() {
  const { user, store, engine } = useDriverApp();
  const sync = useSyncState();
  const [blocked, setBlocked] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unsent = sync.pending + sync.attention;

  function logout() {
    if (unsent > 0) {
      setBlocked(`Há ${unsent} ${unsent === 1 ? "entrega" : "entregas"} guardada${unsent === 1 ? "" : "s"} neste celular e ainda não enviada${unsent === 1 ? "" : "s"}. Sincronize antes de sair, ou o registro se perde.`);
      return;
    }
    if (!navigator.onLine) {
      setBlocked("Sem conexão. Para sair é preciso internet.");
      return;
    }
    startTransition(async () => {
      engine.stop();
      store.close();
      await forgetUser(user.id);
      await logoutAction();
    });
  }

  return (
    <>
      <Button variant="outline" className="h-12 min-w-12 px-4 text-base" disabled={pending} onClick={logout}>
        <LogOutIcon aria-hidden />
        Sair
      </Button>
      <Dialog open={blocked !== null} onOpenChange={(open) => !open && setBlocked(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ainda não dá para sair</DialogTitle>
            <DialogDescription className="text-base">{blocked}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="h-12" onClick={() => setBlocked(null)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
