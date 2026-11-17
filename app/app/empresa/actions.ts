"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, runAction } from "@/lib/actions/run-action";
import { type CompanySettingsDTO, updateCompanySettings } from "@/lib/services/company";
import { companySettingsSchema } from "@/lib/validation/routes";

export async function updateCompanySettingsAction(input: unknown): Promise<ActionResult<CompanySettingsDTO>> {
  return runAction("empresa-editar", input, { schema: companySettingsSchema, permission: "usuarios.gerenciar" }, async (ctx, data) => {
    const company = await updateCompanySettings(ctx, data);
    // O nome da empresa aparece no menu lateral de todas as páginas.
    revalidatePath("/app", "layout");
    return company;
  });
}
