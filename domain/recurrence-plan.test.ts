import { describe, expect, it } from "vitest";

import { type TemplateForGeneration, planRecurringGeneration } from "./recurrence-plan";

const MONDAY = "2026-11-16";
const leite = { id: "leite", sku: "LEITE-1L", name: "Leite 1L", unit: "UN" as const, priceCents: 549, active: true };
const queijo = { id: "queijo", sku: "QJ", name: "Queijo", unit: "KG" as const, priceCents: 4290, active: true };

function template(overrides: Partial<TemplateForGeneration> & { id: string }): TemplateForGeneration {
  return {
    schedule: { dayOfWeek: "SEG", active: true, startsOn: "2026-01-05", pausedUntil: null },
    customer: { id: `c-${overrides.id}`, name: `Cliente ${overrides.id}`, active: true, defaultPaymentMethod: "DINHEIRO" },
    items: [
      { quantityMilli: 12000, unitPriceCents: null, product: leite },
      { quantityMilli: 2750, unitPriceCents: 4000, product: queijo },
    ],
    hasOrderOnDate: false,
    ...overrides,
  };
}

describe("planRecurringGeneration", () => {
  it("cria o pedido com o preço do template ou, sem ele, o preço atual do produto", () => {
    const plan = planRecurringGeneration([template({ id: "a" })], MONDAY);
    expect(plan.alreadyExisted).toBe(0);
    expect(plan.ignored).toEqual([]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0]).toMatchObject({ templateId: "a", customerId: "c-a", paymentMethod: "DINHEIRO", totalCents: 6588 + 11000 });
    expect(plan.toCreate[0]?.lines.map((l) => l.unitPriceCents)).toEqual([549, 4000]);
  });

  it("não considera templates de outro dia, pausados ou inativos (nem como ignorados)", () => {
    const plan = planRecurringGeneration(
      [
        template({ id: "terca", schedule: { dayOfWeek: "TER", active: true, startsOn: "2026-01-05", pausedUntil: null } }),
        template({ id: "pausado", schedule: { dayOfWeek: "SEG", active: true, startsOn: "2026-01-05", pausedUntil: MONDAY } }),
        template({ id: "inativo", schedule: { dayOfWeek: "SEG", active: false, startsOn: "2026-01-05", pausedUntil: null } }),
        template({ id: "futuro", schedule: { dayOfWeek: "SEG", active: true, startsOn: "2026-11-23", pausedUntil: null } }),
      ],
      MONDAY,
    );
    expect(plan).toEqual({ toCreate: [], alreadyExisted: 0, ignored: [] });
  });

  it("conta os que já têm pedido na data (idempotência)", () => {
    const plan = planRecurringGeneration([template({ id: "a", hasOrderOnDate: true }), template({ id: "b" })], MONDAY);
    expect(plan.alreadyExisted).toBe(1);
    expect(plan.toCreate.map((p) => p.templateId)).toEqual(["b"]);
  });

  it("ignora o template inteiro com cliente inativo, sem itens ou com produto inativo, e diz por quê", () => {
    const plan = planRecurringGeneration(
      [
        template({ id: "cliente", customer: { id: "c", name: "Bar Fechado", active: false, defaultPaymentMethod: "PIX" } }),
        template({ id: "vazio", items: [] }),
        template({ id: "produto", items: [{ quantityMilli: 1000, unitPriceCents: null, product: leite }, { quantityMilli: 1000, unitPriceCents: null, product: { ...queijo, active: false } }] }),
        template({ id: "dois", items: [{ quantityMilli: 1000, unitPriceCents: null, product: { ...leite, active: false } }, { quantityMilli: 1000, unitPriceCents: null, product: { ...queijo, active: false } }] }),
        template({ id: "fracao", items: [{ quantityMilli: 1500, unitPriceCents: null, product: leite }] }),
      ],
      MONDAY,
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.ignored.map((i) => [i.templateId, i.reason])).toEqual([
      ["cliente", "Cliente inativo."],
      ["vazio", "Template sem itens."],
      ["produto", "Produto inativo: Queijo (QJ)."],
      ["dois", "Produtos inativos: Leite 1L (LEITE-1L), Queijo (QJ)."],
      ["fracao", "Item inválido no template: Quantidade em UN deve ser um número inteiro."],
    ]);
  });

  it("pedido que já existe conta como existente mesmo se o cliente foi inativado depois", () => {
    const plan = planRecurringGeneration([template({ id: "a", hasOrderOnDate: true, customer: { id: "c", name: "X", active: false, defaultPaymentMethod: "PIX" } })], MONDAY);
    expect(plan).toEqual({ toCreate: [], alreadyExisted: 1, ignored: [] });
  });
});
