import { z } from "zod";

import { USER_ROLES } from "../auth/permissions";
import { emailSchema, idSchema, newPasswordSchema, optionalPhoneSchema, personNameSchema } from "./common";

export const roleSchema = z.enum(USER_ROLES, { error: "Escolha o papel." });

export const createUserSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  phone: optionalPhoneSchema,
  role: roleSchema,
  password: newPasswordSchema,
});
export type CreateUserInput = z.input<typeof createUserSchema>;
export type CreateUserData = z.output<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: idSchema,
  name: personNameSchema,
  email: emailSchema,
  phone: optionalPhoneSchema,
  role: roleSchema,
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type UpdateUserData = z.output<typeof updateUserSchema>;

export const setUserActiveSchema = z.object({
  id: idSchema,
  active: z.boolean(),
});
export type SetUserActiveData = z.output<typeof setUserActiveSchema>;

export const resetPasswordSchema = z.object({
  id: idSchema,
  password: newPasswordSchema,
});
export type ResetPasswordData = z.output<typeof resetPasswordSchema>;

export const listUsersSchema = z.object({
  q: z.string().trim().max(100).optional().transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type ListUsersData = z.output<typeof listUsersSchema>;
