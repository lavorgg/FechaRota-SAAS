import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FechaRota", template: "%s · FechaRota" },
  description: "Romaneio, rotas e comprovante de entrega para distribuidoras.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
