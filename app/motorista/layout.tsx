import type { Metadata, Viewport } from "next";

import { DevProfileSwitcherSlot } from "@/components/dev/dev-profile-switcher-slot";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { requireArea } from "@/lib/auth/current";
import { DRIVER_MANIFEST_URL, THEME_COLOR } from "@/lib/pwa/config";

export const metadata: Metadata = {
  title: "Motorista",
  manifest: DRIVER_MANIFEST_URL,
  appleWebApp: { capable: true, title: "FechaRota", statusBarStyle: "default" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
};

// Área do motorista (seção 5.2): sem sidebar, fonte mínima de 16px, alvos de toque de
// pelo menos 48×48px e ações na metade de baixo da tela.
//
// O HTML não leva nome nem dado do usuário (o app preenche no navegador): o service worker
// guarda esta página para abrir sem sinal, e ela serve a qualquer motorista do aparelho.
export default async function DriverLayout({ children }: LayoutProps<"/motorista">) {
  const session = await requireArea("motorista.acessar");

  return (
    <div className="flex min-h-dvh flex-col text-base">
      <ServiceWorkerRegistration />
      {children}
      <DevProfileSwitcherSlot session={session} />
    </div>
  );
}
