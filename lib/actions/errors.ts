// Funções puras de tratamento de erro das Server Actions.

import type { z } from "zod";

import type { FieldErrors } from "../errors";

/** Primeiro erro de cada campo (pelo nome do campo de topo). */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "_");
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * Descrição do erro para o log, sem a mensagem: mensagens do Prisma podem trazer os valores
 * da consulta (seção 6: nada de senha, token ou documento em log).
 */
export function describeErrorForLog(error: unknown): string {
  if (!(error instanceof Error)) return "erro não identificado";
  const code = (error as { code?: unknown }).code;
  const frames = (error.stack ?? "").split("\n").filter((line) => line.trim().startsWith("at ")).slice(0, 8);
  return [`${error.name}${typeof code === "string" ? ` (${code})` : ""}`, ...frames].join("\n");
}
