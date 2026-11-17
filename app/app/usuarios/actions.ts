"use server";

import { revalidatePath } from "next/cache";

import { runAction, type ActionResult } from "@/lib/actions/run-action";
import { createUser, resetUserPassword, setUserActive, updateUser, type UserDTO } from "@/lib/services/users";
import { createUserSchema, resetPasswordSchema, setUserActiveSchema, updateUserSchema } from "@/lib/validation/users";

const PATH = "/app/usuarios";

export async function createUserAction(input: unknown): Promise<ActionResult<UserDTO>> {
  return runAction("usuario-criar", input, { schema: createUserSchema, permission: "usuarios.gerenciar" }, async (ctx, data) => {
    const user = await createUser(ctx, data);
    revalidatePath(PATH);
    return user;
  });
}

export async function updateUserAction(input: unknown): Promise<ActionResult<UserDTO>> {
  return runAction("usuario-editar", input, { schema: updateUserSchema, permission: "usuarios.gerenciar" }, async (ctx, data) => {
    const user = await updateUser(ctx, data);
    revalidatePath(PATH);
    return user;
  });
}

export async function setUserActiveAction(input: unknown): Promise<ActionResult<UserDTO>> {
  return runAction("usuario-ativo", input, { schema: setUserActiveSchema, permission: "usuarios.gerenciar" }, async (ctx, data) => {
    const user = await setUserActive(ctx, data);
    revalidatePath(PATH);
    return user;
  });
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("usuario-senha", input, { schema: resetPasswordSchema, permission: "usuarios.gerenciar" }, async (ctx, data) => {
    await resetUserPassword(ctx, data);
    revalidatePath(PATH);
    return null;
  });
}
