"use client";

import { Button } from "@/components/ui/button";

// Erro inesperado em qualquer página. Nunca mostra detalhes técnicos (seção 0, regra 6).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
      <p className="text-muted-foreground">Não foi possível carregar esta página. Tente de novo em instantes.</p>
      <Button onClick={reset}>Tentar de novo</Button>
    </main>
  );
}
