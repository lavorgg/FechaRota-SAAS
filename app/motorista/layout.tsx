import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
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

export default function DriverLayout({ children }: LayoutProps<"/motorista">) {
  return (
    <div className="flex min-h-dvh flex-col text-base">
      <ServiceWorkerRegistration />
      {children}
    </div>
  );
}
