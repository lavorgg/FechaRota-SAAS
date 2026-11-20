"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, runAction } from "@/lib/actions/run-action";
import { type CompanySettingsDTO, countFilesBeyondRetention, updateCompanySettings } from "@/lib/services/company";
import { companySettingsSchema } from "@/lib/validation/routes";

export async function updateCompanySettingsAction(input: unknown): Promise<ActionResult<CompanySettingsDTO>> {
  return runAction("empresa-editar", input, { schema: companySettingsSchema, permission: "usuarios.gerenciar" }, async (ctx, data) => {
    const company = await updateCompanySettings(ctx, data);
    // O nome da empresa aparece no menu lateral de todas as páginas.
    revalidatePath("/app", "layout");
    return company;
  });
}

/** Prévia antes de reduzir a retenção: quantos arquivos o cron apagaria. */
export async function previewRetentionAction(input: unknown): Promise<ActionResult<{ files: number }>> {
  return runAction("empresa-previa-retencao", input, { schema: z.object({ months: z.number().int() }), permission: "usuarios.gerenciar", write: false }, async (ctx, data) => ({
    files: await countFilesBeyondRetention(ctx, data.months),
  }));
}
