// Itens do pedido com preço calculado NO SERVIDOR (seção 5.5): o navegador só manda o
// produto e a quantidade digitada; preço, subtotal e total saem daqui.

import { type ProductUnit, calcSubtotalCents, parseQuantityToMilli, validateQuantityForUnit } from "./quantity";

export const MAX_ORDER_ITEMS = 100;

export type CatalogProduct = {
  id: string;
  name: string;
  unit: ProductUnit;
  priceCents: number;
  active: boolean;
};

export type PricedLine = {
  productId: string;
  productName: string;
  unit: ProductUnit;
  quantityMilli: number;
  unitPriceCents: number;
  subtotalCents: number;
};

export type PriceLinesResult =
  | { ok: true; lines: PricedLine[]; totalCents: number }
  | { ok: false; error: string; lineErrors: Record<number, string> };

export function priceOrderLines(
  items: ReadonlyArray<{ productId: string; quantity: string; unitPriceCents?: number | null }>,
  catalog: ReadonlyMap<string, CatalogProduct>,
): PriceLinesResult {
  if (items.length === 0) return { ok: false, error: "Adicione pelo menos um item.", lineErrors: {} };
  if (items.length > MAX_ORDER_ITEMS) return { ok: false, error: `O pedido pode ter no máximo ${MAX_ORDER_ITEMS} itens.`, lineErrors: {} };

  const lineErrors: Record<number, string> = {};
  const lines: PricedLine[] = [];
  items.forEach((item, index) => {
    const product = catalog.get(item.productId);
    if (!product) {
      lineErrors[index] = "Produto não encontrado.";
      return;
    }
    if (!product.active) {
      lineErrors[index] = `${product.name} está inativo.`;
      return;
    }
    const parsed = parseQuantityToMilli(item.quantity);
    const checked = parsed.ok ? validateQuantityForUnit(parsed.milli, product.unit) : parsed;
    if (!checked.ok) {
      lineErrors[index] = checked.error;
      return;
    }
    const unitPriceCents = item.unitPriceCents ?? product.priceCents;
    lines.push({
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantityMilli: checked.milli,
      unitPriceCents,
      subtotalCents: calcSubtotalCents(checked.milli, unitPriceCents),
    });
  });

  if (Object.keys(lineErrors).length > 0) {
    return { ok: false, error: "Confira os itens destacados.", lineErrors };
  }
  return { ok: true, lines, totalCents: lines.reduce((sum, line) => sum + line.subtotalCents, 0) };
}
