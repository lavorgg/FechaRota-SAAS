// Pedidos e templates recorrentes (seção 5.5).

import { z } from "zod";

import { DAYS_OF_WEEK } from "../../domain/dates";
import { MAX_ORDER_ITEMS } from "../../domain/order-lines";
import { ORDER_STATUSES } from "../../domain/order-status";
import { PAYMENT_METHODS } from "../../domain/payment";
import { dateStringSchema, idSchema, optionalMoneySchema, optionalText, versionSchema } from "./common";

/** Item como o navegador manda: produto e a quantidade digitada. Preço NUNCA vem do navegador. */
export const orderItemSchema = z.object({
  productId: idSchema,
  quantity: z.string({ error: "Informe a quantidade." }).trim().min(1, "Informe a quantidade.").max(20),
});

const itemsSchema = z.array(orderItemSchema).min(1, "Adicione pelo menos um item.").max(MAX_ORDER_ITEMS, `No máximo ${MAX_ORDER_ITEMS} itens.`);

const orderFields = {
  deliveryDate: dateStringSchema,
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Escolha a forma de pagamento." }),
  items: itemsSchema,
  notes: optionalText(500),
  invoiceNumber: optionalText(30, "Número da NF-e longo demais."),
  /** O usuário já confirmou que quer mais de um pedido do cliente na mesma data. */
  confirmDuplicate: z.boolean().default(false),
};

export const createOrderSchema = z.object({
  customerId: idSchema,
  ...orderFields,
  /** "Salvar também como pedido recorrente" com o dia da semana escolhido. */
  recurringDayOfWeek: z.enum(DAYS_OF_WEEK).nullable().default(null),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type CreateOrderData = z.output<typeof createOrderSchema>;

export const updateOrderSchema = z.object({ id: idSchema, version: versionSchema, ...orderFields });
export type UpdateOrderInput = z.input<typeof updateOrderSchema>;
export type UpdateOrderData = z.output<typeof updateOrderSchema>;

export const cancelOrderSchema = z.object({
  id: idSchema,
  version: versionSchema,
  reason: z.string({ error: "Informe o motivo." }).trim().min(3, "Informe o motivo do cancelamento.").max(300, "Motivo longo demais."),
});
export type CancelOrderData = z.output<typeof cancelOrderSchema>;

export const rescheduleOrderSchema = z.object({ id: idSchema, deliveryDate: dateStringSchema });
export type RescheduleOrderData = z.output<typeof rescheduleOrderSchema>;

export const listOrdersSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  bairro: z.string().trim().max(200).optional().catch(undefined).transform((value) => value || undefined),
  cliente: z.string().trim().max(100).optional().catch(undefined).transform((value) => value || undefined),
  /** id da rota, ou "sem-rota". */
  rota: z.string().trim().max(64).optional().catch(undefined).transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type ListOrdersData = z.output<typeof listOrdersSchema>;

export const generateRecurringSchema = z.object({ date: dateStringSchema });

// ---------------------------------------------------------------------------
// Templates recorrentes
// ---------------------------------------------------------------------------

export const templateItemSchema = orderItemSchema.extend({
  /** Preço combinado só para este template; vazio = preço do produto no dia da geração. */
  unitPrice: optionalMoneySchema,
});

const templateFields = {
  dayOfWeek: z.enum(DAYS_OF_WEEK, { error: "Escolha o dia da semana." }),
  startsOn: dateStringSchema,
  notes: optionalText(300),
  items: z.array(templateItemSchema).min(1, "Adicione pelo menos um item.").max(MAX_ORDER_ITEMS, `No máximo ${MAX_ORDER_ITEMS} itens.`),
};

export const createTemplateSchema = z.object({ customerId: idSchema, ...templateFields });
export type CreateTemplateInput = z.input<typeof createTemplateSchema>;
export type CreateTemplateData = z.output<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({ id: idSchema, ...templateFields });
export type UpdateTemplateInput = z.input<typeof updateTemplateSchema>;
export type UpdateTemplateData = z.output<typeof updateTemplateSchema>;

export const pauseTemplateSchema = z.object({ id: idSchema, pausedUntil: dateStringSchema.nullable() });
export type PauseTemplateData = z.output<typeof pauseTemplateSchema>;
