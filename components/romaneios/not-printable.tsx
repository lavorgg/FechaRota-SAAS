// Peças comuns às páginas de impressão dos romaneios.

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ServiceError } from "@/lib/errors";
import { MANIFEST_MESSAGES } from "@/lib/services/manifests";

/** Rota ainda em rascunho: a página mostra o aviso em vez do romaneio. */
export function isNotPrintable(error: unknown): null {
  if (error instanceof ServiceError && error.message === MANIFEST_MESSAGES.notPrintable) return null;
  throw error;
}

export function NotPrintable({ routeId }: { routeId: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
      <p className="font-medium">{MANIFEST_MESSAGES.notPrintable}</p>
      <Button asChild variant="outline">
        <Link href={`/app/rotas/${routeId}`}>Voltar para a rota</Link>
      </Button>
    </div>
  );
}
