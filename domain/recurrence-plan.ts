// Plano do gerador de pedidos recorrentes (seção 5.5). Módulo puro: decide o que criar,
// o que já existia e o que é ignorado (e por quê). O serviço executa o plano numa transação.
//
// Template com qualquer produto inativo é ignorado INTEIRO (decisão do dono do produto):
// pedido incompleto gerado sem ninguém perceber é pior que pedido não gerado e listado.

import type { PaymentMethod } from "./payment";
import { type CatalogProduct, type PricedLine, priceOrderLines } from "./order-lines";
import { milliToDecimalString } from "./quantity";
import { type TemplateSchedule, isTemplateDueOn } from "./recurrence";

export type TemplateForGeneration = {
  id: string;
  schedule: TemplateSchedule;
  customer: { id: string; name: string; active: boolean; defaultPaymentMethod: PaymentMethod };
  items: Array<{ quantityMilli: number; unitPriceCents: number | null; product: CatalogProduct & { sku: string } }>;
  /** Já existe pedido deste template na data (regra de idempotência). */
  hasOrderOnDate: boolean;
};

export type PlannedOrder = {
  templateId: string;
  customerId: string;
  customerName: string;
  paymentMethod: PaymentMethod;
  lines: PricedLine[];
  totalCents: number;
};

export type GenerationPlan = {
  toCreate: PlannedOrder[];
  alreadyExisted: number;
  ignored: Array<{ templateId: string; customerName: string; reason: string }>;
};

export function planRecurringGeneration(templates: ReadonlyArray<TemplateForGeneration>, date: string): GenerationPlan {
  const plan: GenerationPlan = { toCreate: [], alreadyExisted: 0, ignored: [] };

  for (const template of templates) {
    if (!isTemplateDueOn(template.schedule, date)) continue;
    if (template.hasOrderOnDate) {
      plan.alreadyExisted += 1;
      continue;
    }
    const ignore = (reason: string) => plan.ignored.push({ templateId: template.id, customerName: template.customer.name, reason });

    if (!template.customer.active) {
      ignore("Cliente inativo.");
      continue;
    }
    if (template.items.length === 0) {
      ignore("Template sem itens.");
      continue;
    }
    const inactive = template.items.filter((item) => !item.product.active).map((item) => `${item.product.name} (${item.product.sku})`);
    if (inactive.length > 0) {
      ignore(`${inactive.length === 1 ? "Produto inativo" : "Produtos inativos"}: ${inactive.join(", ")}.`);
      continue;
    }

    const catalog = new Map(template.items.map((item) => [item.product.id, item.product]));
    const priced = priceOrderLines(
      template.items.map((item) => ({ productId: item.product.id, quantity: milliToDecimalString(item.quantityMilli), unitPriceCents: item.unitPriceCents })),
      catalog,
    );
    if (!priced.ok) {
      const firstError = Object.values(priced.lineErrors)[0] ?? priced.error;
      ignore(`Item inválido no template: ${firstError}`);
      continue;
    }
    plan.toCreate.push({
      templateId: template.id,
      customerId: template.customer.id,
      customerName: template.customer.name,
      paymentMethod: template.customer.defaultPaymentMethod,
      lines: priced.lines,
      totalCents: priced.totalCents,
    });
  }
  return plan;
}
