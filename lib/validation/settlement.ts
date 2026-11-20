// Fechamento e acerto (seção 5.8).

import { z } from "zod";

import { MAX_CENTS } from "../../domain/money";
import { idSchema, versionSchema } from "./common";

const cents = z.number({ error: "Informe o valor." }).int().min(0, "Valor inválido.").max(MAX_CENTS, "Valor acima do limite.");

export const pixConfirmationSchema = z.object({ orderId: idSchema, confirmed: z.boolean() });
export type PixConfirmationData = z.output<typeof pixConfirmationSchema>;

export const paymentCorrectionSchema = z.object({
  orderId: idSchema,
  cashCents: cents,
  pixCents: cents,
  reason: z.string({ error: "Informe o motivo." }).trim().min(3, "Informe o motivo da correção.").max(300, "Motivo longo demais."),
});
export type PaymentCorrectionData = z.output<typeof paymentCorrectionSchema>;

export const concludeSettlementSchema = z.object({ id: idSchema, version: versionSchema, cashHandedInCents: cents });
export type ConcludeSettlementData = z.output<typeof concludeSettlementSchema>;
