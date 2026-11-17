import type { Metadata, Viewport } from "next";

import { DevProfileSwitcherSlot } from "@/components/dev/dev-profile-switcher-slot";
import { DriverLogoutButton } from "@/components/motorista/logout-button";
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
export default async function DriverLayout({ children }: LayoutProps<"/motorista">) {
  const session = await requireArea("motorista.acessar");

  return (
    <div className="flex min-h-dvh flex-col text-base">
      <ServiceWorkerRegistration />
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{session.user.name}</span>
          <span className="truncate text-sm text-muted-foreground">{session.company.name}</span>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="sticky bottom-0 flex justify-end border-t bg-background px-4 py-3">
        <DriverLogoutButton />
      </footer>
      <DevProfileSwitcherSlot session={session} />
    </div>
  );
}
