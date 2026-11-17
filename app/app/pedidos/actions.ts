"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runAction, type ActionResult } from "@/lib/actions/run-action";
import {
  type LastOrderDTO,
  type OrderCustomerOption,
  type OrderForEditDTO,
  type SavedOrder,
  cancelOrder,
  createOrder,
  getCustomerOrderContext,
  getOrderForEdit,
  rescheduleOrder,
  searchOrderCustomers,
  updateOrder,
} from "@/lib/services/orders";
import { type GenerationResult, generateRecurringOrders } from "@/lib/services/recurring-generator";
import { dateStringSchema, idSchema } from "@/lib/validation/common";
import { cancelOrderSchema, createOrderSchema, generateRecurringSchema, rescheduleOrderSchema, updateOrderSchema } from "@/lib/validation/orders";

function refresh() {
  revalidatePath("/app/pedidos");
  revalidatePath("/app/dashboard");
}

export async function searchOrderCustomersAction(input: unknown): Promise<ActionResult<OrderCustomerOption[]>> {
  return runAction("pedido-buscar-cliente", input, { schema: z.object({ q: z.string().max(100) }), permission: "pedidos.gerenciar", write: false }, (ctx, data) =>
    searchOrderCustomers(ctx, data.q),
  );
}

export async function customerOrderContextAction(input: unknown): Promise<ActionResult<{ lastOrder: LastOrderDTO | null; ordersOnDate: number[] }>> {
  return runAction(
    "pedido-contexto-cliente",
    input,
    { schema: z.object({ customerId: idSchema, date: dateStringSchema }), permission: "pedidos.gerenciar", write: false },
    (ctx, data) => getCustomerOrderContext(ctx, data.customerId, data.date),
  );
}

export async function getOrderForEditAction(input: unknown): Promise<ActionResult<OrderForEditDTO>> {
  return runAction("pedido-abrir", input, { schema: z.object({ id: idSchema }), permission: "pedidos.gerenciar", write: false }, (ctx, data) => getOrderForEdit(ctx, data.id));
}

export async function createOrderAction(input: unknown): Promise<ActionResult<SavedOrder>> {
  return runAction("pedido-criar", input, { schema: createOrderSchema, permission: "pedidos.gerenciar" }, async (ctx, data) => {
    const order = await createOrder(ctx, data);
    refresh();
    return order;
  });
}

export async function updateOrderAction(input: unknown): Promise<ActionResult<SavedOrder>> {
  return runAction("pedido-editar", input, { schema: updateOrderSchema, permission: "pedidos.gerenciar" }, async (ctx, data) => {
    const order = await updateOrder(ctx, data);
    refresh();
    return order;
  });
}

export async function cancelOrderAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("pedido-cancelar", input, { schema: cancelOrderSchema, permission: "pedidos.gerenciar" }, async (ctx, data) => {
    await cancelOrder(ctx, data);
    refresh();
    return null;
  });
}

export async function rescheduleOrderAction(input: unknown): Promise<ActionResult<SavedOrder>> {
  return runAction("pedido-reagendar", input, { schema: rescheduleOrderSchema, permission: "pedidos.gerenciar" }, async (ctx, data) => {
    const order = await rescheduleOrder(ctx, data);
    refresh();
    return order;
  });
}

/**
 * Não revalida a tela aqui: o resultado aparece num diálogo, e recarregar o dashboard agora
 * tiraria o alerta (e o diálogo junto) antes de a pessoa ler. A tela recarrega ao fechar.
 */
export async function generateRecurringAction(input: unknown): Promise<ActionResult<GenerationResult>> {
  return runAction("recorrentes-gerar", input, { schema: generateRecurringSchema, permission: "pedidos.gerenciar" }, (ctx, data) =>
    generateRecurringOrders(ctx, data.date),
  );
}
