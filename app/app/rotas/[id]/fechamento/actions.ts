"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, runAction } from "@/lib/actions/run-action";
import { type ProofFilesDTO, concludeSettlement, correctDeliveryPayment, getProofFileUrls, setPixConfirmation } from "@/lib/services/settlement";
import { idSchema } from "@/lib/validation/common";
import { concludeSettlementSchema, paymentCorrectionSchema, pixConfirmationSchema } from "@/lib/validation/settlement";

function refresh() {
  revalidatePath("/app/rotas", "layout");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/pedidos");
}

export async function setPixConfirmationAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("acerto-pix", input, { schema: pixConfirmationSchema, permission: "acerto.realizar" }, async (ctx, data) => {
    await setPixConfirmation(ctx, data);
    refresh();
    return null;
  });
}

export async function correctDeliveryPaymentAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("acerto-corrigir", input, { schema: paymentCorrectionSchema, permission: "entregas.corrigir" }, async (ctx, data) => {
    await correctDeliveryPayment(ctx, data);
    refresh();
    return null;
  });
}

export async function concludeSettlementAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("acerto-concluir", input, { schema: concludeSettlementSchema, permission: "acerto.realizar" }, async (ctx, data) => {
    await concludeSettlement(ctx, data);
    refresh();
    return null;
  });
}

/** URLs de 5 minutos, pedidas só quando a pessoa abre o comprovante. */
export async function proofFilesAction(input: unknown): Promise<ActionResult<ProofFilesDTO>> {
  return runAction("acerto-comprovante", input, { schema: z.object({ orderId: idSchema }), permission: "acerto.realizar", write: false }, (ctx, data) => getProofFileUrls(ctx, data.orderId));
}
