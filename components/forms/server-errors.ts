import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import type { ActionResult } from "@/lib/actions/result";

/** Põe os erros de campo devolvidos pelo servidor embaixo de cada campo do formulário. */
export function applyServerFieldErrors<T extends FieldValues, C, O>(form: UseFormReturn<T, C, O>, result: ActionResult<unknown>): void {
  if (result.ok || !result.fieldErrors) return;
  for (const [field, message] of Object.entries(result.fieldErrors)) {
    if (field in form.getValues()) {
      form.setError(field as Path<T>, { type: "server", message });
    }
  }
}
