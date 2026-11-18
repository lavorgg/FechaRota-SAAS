// Entradas da área do motorista (seção 5.7). Os valores chegam do celular, às vezes horas
// depois da entrega: tudo é conferido de novo aqui e nas regras de domain/delivery.ts.

import { z } from "zod";

import { DELIVERY_OUTCOMES, FAILURE_REASONS, MAX_CONTAINERS_PER_STOP, MAX_PROOF_PHOTOS, TEXT_LIMITS } from "../../domain/delivery";
import { MAX_QUANTITY_MILLI } from "../../domain/quantity";
import { MAX_CENTS } from "../../domain/money";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "../storage/keys";
import { idSchema } from "./common";

const uuidSchema = z.uuid({ error: "Identificador de envio inválido." });
const cents = z.number().int().min(0).max(MAX_CENTS);
const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const presignSchema = z.object({
  clientRequestId: uuidSchema,
  orderId: idSchema,
  files: z
    .array(
      z.object({
        kind: z.enum(["PHOTO", "SIGNATURE"]),
        contentType: z.enum(Object.keys(ALLOWED_UPLOAD_TYPES) as [keyof typeof ALLOWED_UPLOAD_TYPES, ...Array<keyof typeof ALLOWED_UPLOAD_TYPES>], { error: "Tipo de arquivo não permitido." }),
        sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES, "Arquivo maior que 2 MB."),
      }),
    )
    .min(1)
    .max(MAX_PROOF_PHOTOS + 1)
    .refine((files) => files.filter((file) => file.kind === "SIGNATURE").length <= 1, "Só uma assinatura por entrega.")
    .refine((files) => files.filter((file) => file.kind === "PHOTO").length <= MAX_PROOF_PHOTOS, `No máximo ${MAX_PROOF_PHOTOS} fotos.`),
});
export type PresignData = z.output<typeof presignSchema>;

const fileKey = z.string().min(1).max(300);

export const finalizeDeliverySchema = z.object({
  clientRequestId: uuidSchema,
  orderId: idSchema,
  outcome: z.enum(DELIVERY_OUTCOMES),
  deliveredAt: z.iso.datetime({ offset: true, error: "Horário da entrega inválido." }),
  items: z
    .array(
      z.object({
        orderItemId: idSchema,
        deliveredMilli: z.number().int().min(0).max(MAX_QUANTITY_MILLI),
        returnReason: optionalString(TEXT_LIMITS.returnReason),
      }),
    )
    .max(200),
  failureReason: z.enum(FAILURE_REASONS).nullable(),
  failureNote: optionalString(TEXT_LIMITS.failureNote),
  cashCents: cents,
  pixCents: cents,
  confirmDifferentAmount: z.boolean(),
  containers: z
    .array(
      z.object({
        containerProductId: idSchema,
        delivered: z.number().int().min(0).max(MAX_CONTAINERS_PER_STOP),
        returned: z.number().int().min(0).max(MAX_CONTAINERS_PER_STOP),
      }),
    )
    .max(20),
  receiverName: optionalString(TEXT_LIMITS.receiverName),
  receiverDocument: optionalString(TEXT_LIMITS.receiverDocument),
  signatureKey: fileKey.nullable(),
  photoKeys: z.array(fileKey).max(MAX_PROOF_PHOTOS),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracyMeters: z.number().min(0).max(100_000).nullable(),
    })
    .nullable(),
});
export type FinalizeDeliveryData = z.output<typeof finalizeDeliverySchema>;
export type FinalizeDeliveryInput = z.input<typeof finalizeDeliverySchema>;
