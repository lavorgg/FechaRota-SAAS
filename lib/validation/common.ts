// Schemas Zod compartilhados entre navegador e servidor (seção 2: os mesmos schemas nos dois).
// Mensagens em português, prontas para aparecer embaixo do campo.

import { z } from "zod";

import { validateDocument } from "../../domain/document";
import { normalizePhoneBR } from "../../domain/normalize";

export const MIN_PASSWORD_LENGTH = 8;
// O bcrypt ignora o que passa de 72 bytes.
export const MAX_PASSWORD_BYTES = 72;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

export const emailSchema = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail longo demais.")
  .pipe(z.email({ error: "E-mail inválido." }));

/** Senha nova: regras de tamanho. Na tela de login usa-se `loginPasswordSchema`. */
export const newPasswordSchema = z
  .string({ error: "Informe a senha." })
  .min(MIN_PASSWORD_LENGTH, `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .refine((value) => utf8Bytes(value) <= MAX_PASSWORD_BYTES, "A senha é longa demais.");

export const loginPasswordSchema = z
  .string({ error: "Informe a senha." })
  .min(1, "Informe a senha.")
  .refine((value) => utf8Bytes(value) <= MAX_PASSWORD_BYTES, "A senha é longa demais.");

export const personNameSchema = z
  .string({ error: "Informe o nome." })
  .trim()
  .min(2, "Informe o nome.")
  .max(120, "Nome longo demais.");

/** Telefone opcional: vazio vira null; preenchido é normalizado para dígitos com DDI 55. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const result = normalizePhoneBR(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.phone;
  });

/** CNPJ opcional: vazio vira null; preenchido precisa ser um CNPJ válido. */
export const optionalCnpjSchema = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const result = validateDocument(value);
    if (!result.ok || result.kind !== "CNPJ") {
      ctx.addIssue({ code: "custom", message: "CNPJ inválido." });
      return z.NEVER;
    }
    return result.value;
  });

export const idSchema = z.string({ error: "Registro inválido." }).min(1, "Registro inválido.").max(64, "Registro inválido.");

/** Fusos horários do Brasil oferecidos no cadastro (sem horário de verão desde 2019). */
export const BRAZIL_TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Horário de Brasília (UTC−3)" },
  { value: "America/Manaus", label: "AM, MT, MS, RO e RR (UTC−4)" },
  { value: "America/Rio_Branco", label: "Acre (UTC−5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (UTC−2)" },
] as const;

export const timezoneSchema = z.enum(
  BRAZIL_TIMEZONES.map((tz) => tz.value) as [string, ...string[]],
  { error: "Escolha o fuso horário." },
);
