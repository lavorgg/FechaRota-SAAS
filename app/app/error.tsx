"use client";

import { Button } from "@/components/ui/button";

export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">Não foi possível carregar esta tela</h1>
      <p className="text-muted-foreground">Tente de novo em instantes. Se continuar, fale com o suporte.</p>
      <Button onClick={reset}>Tentar de novo</Button>
    </div>
  );
}
