"use client";

import { CalendarSyncIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { generateRecurringAction } from "@/app/app/pedidos/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateString } from "@/domain/dates";
import type { GenerationResult } from "@/lib/services/recurring-generator";

/** "Gerar pedidos recorrentes para [data]" (seção 5.5), com o resultado detalhado. */
export function GenerateRecurringButton({ date, disabled, variant = "outline" }: { date: string; disabled?: boolean; variant?: "outline" | "default" }) {
  const router = useRouter();
  const [result, setResult] = useState<GenerationResult | null>(null);

  function close() {
    setResult(null);
    router.refresh();
  }
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const response = await generateRecurringAction({ date });
      if (response.ok) setResult(response.data);
      else toast.error(response.error);
    });
  }

  return (
    <>
      <Button variant={variant} onClick={generate} disabled={disabled || pending}>
        <CalendarSyncIcon aria-hidden />
        {pending ? "Gerando..." : `Gerar recorrentes para ${formatDateString(date)}`}
      </Button>
      <Dialog open={result !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-lg">
          {result && (
            <>
              <DialogHeader>
                <DialogTitle>Pedidos recorrentes de {formatDateString(result.date)}</DialogTitle>
                <DialogDescription>
                  {result.created.length} {result.created.length === 1 ? "pedido criado" : "pedidos criados"}, {result.alreadyExisted} já{" "}
                  {result.alreadyExisted === 1 ? "existia" : "existiam"}, {result.ignored.length} {result.ignored.length === 1 ? "ignorado" : "ignorados"}.
                </DialogDescription>
              </DialogHeader>
              {result.created.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-medium">Criados</h3>
                  <ul className="text-sm text-muted-foreground">
                    {result.created.map((order) => (
                      <li key={order.orderNumber}>
                        Pedido nº {order.orderNumber} · {order.customerName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.ignored.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-medium">Ignorados</h3>
                  <ul className="text-sm">
                    {result.ignored.map((item) => (
                      <li key={`${item.customerName}-${item.reason}`}>
                        <span className="font-medium">{item.customerName}</span>: <span className="text-destructive">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <DialogFooter>
                <Button onClick={close}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
