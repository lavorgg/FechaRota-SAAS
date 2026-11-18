// Faixa de cobrança (seção 5.7): vermelha "COBRAR" ou verde "NÃO COBRAR", sempre com ícone e
// texto, para não depender só da cor.

import { BanknoteIcon, CircleCheckBigIcon } from "lucide-react";

import { formatCents } from "@/domain/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethod, isCollectedOnDelivery } from "@/domain/payment";

export function PaymentBand({ paymentMethod, amountCents }: { paymentMethod: PaymentMethod; amountCents: number }) {
  if (isCollectedOnDelivery(paymentMethod)) {
    return (
      <p data-testid="faixa-cobranca" className="flex items-center gap-3 rounded-xl border-2 border-red-800 bg-red-700 px-4 py-3 text-lg font-bold text-white">
        <BanknoteIcon className="size-6 shrink-0" aria-hidden />
        COBRAR {formatCents(amountCents)} — {PAYMENT_METHOD_LABELS[paymentMethod].toUpperCase()}
      </p>
    );
  }
  return (
    <p data-testid="faixa-cobranca" className="flex items-center gap-3 rounded-xl border-2 border-green-800 bg-green-700 px-4 py-3 text-lg font-bold text-white">
      <CircleCheckBigIcon className="size-6 shrink-0" aria-hidden />
      {PAYMENT_METHOD_LABELS[paymentMethod].toUpperCase()} — NÃO COBRAR
    </p>
  );
}
