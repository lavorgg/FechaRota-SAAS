import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FechaRota", template: "%s · FechaRota" },
  description: "Romaneio, rotas e comprovante de entrega para distribuidoras.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
