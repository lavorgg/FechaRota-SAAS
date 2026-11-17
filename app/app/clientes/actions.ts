"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runAction, type ActionResult } from "@/lib/actions/run-action";
import { type CustomerDTO, createCustomer, deleteCustomer, setCustomerActive, updateCustomer } from "@/lib/services/customers";
import { importCustomers } from "@/lib/services/imports";
import { type TemplateDTO, createTemplate, pauseTemplate, setTemplateActive, updateTemplate } from "@/lib/services/templates";
import { customerSchema, deleteSchema, setActiveSchema, updateCustomerSchema } from "@/lib/validation/catalog";
import { type ImportBatchResult, importBatchSchema } from "@/lib/validation/import";
import { createTemplateSchema, pauseTemplateSchema, updateTemplateSchema } from "@/lib/validation/orders";
import { idSchema } from "@/lib/validation/common";

const PATH = "/app/clientes";

export async function createCustomerAction(input: unknown): Promise<ActionResult<CustomerDTO>> {
  return runAction("cliente-criar", input, { schema: customerSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const customer = await createCustomer(ctx, data);
    revalidatePath(PATH);
    return customer;
  });
}

export async function updateCustomerAction(input: unknown): Promise<ActionResult<CustomerDTO>> {
  return runAction("cliente-editar", input, { schema: updateCustomerSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const customer = await updateCustomer(ctx, data);
    revalidatePath(PATH);
    return customer;
  });
}

export async function setCustomerActiveAction(input: unknown): Promise<ActionResult<CustomerDTO>> {
  return runAction("cliente-ativo", input, { schema: setActiveSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const customer = await setCustomerActive(ctx, data.id, data.active);
    revalidatePath(PATH);
    return customer;
  });
}

export async function deleteCustomerAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("cliente-excluir", input, { schema: deleteSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    await deleteCustomer(ctx, data.id);
    revalidatePath(PATH);
    return null;
  });
}

export async function importCustomersAction(input: unknown): Promise<ActionResult<ImportBatchResult>> {
  return runAction("cliente-importar", input, { schema: importBatchSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const result = await importCustomers(ctx, data);
    revalidatePath(PATH);
    return result;
  });
}

// --- Pedidos recorrentes do cliente ---

export async function createTemplateAction(input: unknown): Promise<ActionResult<TemplateDTO>> {
  return runAction("recorrente-criar", input, { schema: createTemplateSchema, permission: "pedidos.gerenciar" }, async (ctx, data) => {
    const template = await createTemplate(ctx, data);
    revalidatePath(`${PATH}/${data.customerId}`);
    return template;
  });
}

export async function updateTemplateAction(input: unknown): Promise<ActionResult<TemplateDTO>> {
  return runAction("recorrente-editar", input, { schema: updateTemplateSchema, permission: "pedidos.gerenciar" }, async (ctx, data) => {
    const template = await updateTemplate(ctx, data);
    revalidatePath(PATH, "layout");
    return template;
  });
}

export async function pauseTemplateAction(input: unknown): Promise<ActionResult<TemplateDTO>> {
  return runAction("recorrente-pausar", input, { schema: pauseTemplateSchema, permission: "pedidos.gerenciar" }, async (ctx, data) => {
    const template = await pauseTemplate(ctx, data);
    revalidatePath(PATH, "layout");
    return template;
  });
}

export async function setTemplateActiveAction(input: unknown): Promise<ActionResult<TemplateDTO>> {
  return runAction("recorrente-ativo", input, { schema: z.object({ id: idSchema, active: z.boolean() }), permission: "pedidos.gerenciar" }, async (ctx, data) => {
    const template = await setTemplateActive(ctx, data.id, data.active);
    revalidatePath(PATH, "layout");
    return template;
  });
}
