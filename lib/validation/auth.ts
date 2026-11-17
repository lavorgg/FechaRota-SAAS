import { z } from "zod";

import {
  emailSchema,
  loginPasswordSchema,
  newPasswordSchema,
  optionalCnpjSchema,
  personNameSchema,
  timezoneSchema,
} from "./common";

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
  /** Para onde voltar depois do login (validado de novo no servidor por safeNextPath). */
  next: z.string().max(500).optional(),
});
export type LoginInput = z.input<typeof loginSchema>;

export const signupSchema = z
  .object({
    companyName: z.string({ error: "Informe o nome da empresa." }).trim().min(2, "Informe o nome da empresa.").max(120, "Nome longo demais."),
    cnpj: optionalCnpjSchema,
    timezone: timezoneSchema,
    adminName: personNameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    passwordConfirmation: z.string({ error: "Repita a senha." }),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "As senhas não conferem.",
  });
export type SignupInput = z.input<typeof signupSchema>;
export type SignupData = z.output<typeof signupSchema>;
