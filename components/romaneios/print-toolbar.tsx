"use client";

import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Barra da tela (some na impressão): voltar e imprimir. */
export function PrintToolbar({ backHref, title }: { backHref: string; title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        Voltar para a rota
      </Link>
      <div className="flex items-center gap-3">
        <p className="hidden text-sm text-muted-foreground sm:block">A4, retrato. No Chrome, &quot;Salvar como PDF&quot; também funciona.</p>
        <Button onClick={() => window.print()}>
          <PrinterIcon aria-hidden />
          Imprimir {title}
        </Button>
      </div>
    </div>
  );
}
