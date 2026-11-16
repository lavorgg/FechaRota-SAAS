// Consolidação do Romaneio de Carga (seção 5.6): soma por produto de tudo que sai na rota,
// peso estimado e vasilhames a carregar. Módulo puro, usado na tela e na impressão.

import type { ProductUnit } from "./quantity";

export type CargoItemInput = {
  /** Agrupa as paradas na conta de vasilhames: cada pedido é embalado separadamente. */
  orderId: string;
  productId: string;
  sku: string;
  productName: string;
  unit: ProductUnit;
  quantityMilli: number;
  /** Peso por unidade de venda, em gramas. Nulo quando o produto não tem peso cadastrado. */
  unitWeightGrams: number | null;
  /** Vasilhame retornável em que o produto sai, se houver. */
  container: {
    productId: string;
    sku: string;
    name: string;
    /** Quantas unidades do produto cabem em um vasilhame. Nulo = 1 vasilhame por unidade. */
    unitsPerContainer: number | null;
  } | null;
};

export type CargoProductLine = {
  productId: string;
  sku: string;
  productName: string;
  unit: ProductUnit;
  quantityMilli: number;
  /** Nulo quando o produto não tem peso cadastrado. */
  weightGrams: number | null;
};

export type CargoContainerLine = {
  productId: string;
  sku: string;
  name: string;
  count: number;
};

export type CargoManifest = {
  products: CargoProductLine[];
  containers: CargoContainerLine[];
  /** Soma dos pesos conhecidos. */
  totalWeightGrams: number;
  /** Verdadeiro se algum produto não tem peso: o total é parcial e a tela mostra "peso incompleto". */
  weightIncomplete: boolean;
  orderCount: number;
};

/** Peso de um item em gramas: quantidade × peso unitário, arredondado para o grama mais próximo. */
export function calcItemWeightGrams(quantityMilli: number, unitWeightGrams: number): number {
  return Number((BigInt(quantityMilli) * BigInt(unitWeightGrams) + BigInt(500)) / BigInt(1000));
}

/**
 * Vasilhames necessários para um item de pedido.
 * Arredonda para cima: 30 unidades em caixas de 12 ocupam 3 caixas.
 */
export function calcContainersForItem(quantityMilli: number, unitsPerContainer: number | null): number {
  const perContainer = unitsPerContainer ?? 1;
  if (!Number.isInteger(perContainer) || perContainer <= 0) {
    throw new Error("Unidades por vasilhame deve ser um inteiro maior que zero.");
  }
  return Math.ceil(quantityMilli / (perContainer * 1000));
}

/**
 * Vasilhames por pedido: as quantidades de produtos que usam o mesmo vasilhame NÃO são
 * misturadas entre produtos (uma caixa de leite não é completada com iogurte), mas itens
 * repetidos do mesmo produto no mesmo pedido são somados antes de arredondar.
 */
export function calcContainersByOrder(
  items: ReadonlyArray<CargoItemInput>,
): Map<string, CargoContainerLine[]> {
  const perOrderProduct = new Map<string, { item: CargoItemInput; quantityMilli: number }>();
  for (const item of items) {
    if (!item.container) continue;
    const key = `${item.orderId}\u0000${item.productId}`;
    const current = perOrderProduct.get(key);
    if (current) {
      current.quantityMilli += item.quantityMilli;
    } else {
      perOrderProduct.set(key, { item, quantityMilli: item.quantityMilli });
    }
  }

  const byOrder = new Map<string, Map<string, CargoContainerLine>>();
  for (const { item, quantityMilli } of perOrderProduct.values()) {
    const container = item.container;
    if (!container) continue;
    const count = calcContainersForItem(quantityMilli, container.unitsPerContainer);
    const lines = byOrder.get(item.orderId) ?? new Map<string, CargoContainerLine>();
    const line = lines.get(container.productId);
    if (line) {
      line.count += count;
    } else {
      lines.set(container.productId, {
        productId: container.productId,
        sku: container.sku,
        name: container.name,
        count,
      });
    }
    byOrder.set(item.orderId, lines);
  }

  const result = new Map<string, CargoContainerLine[]>();
  for (const [orderId, lines] of byOrder) {
    result.set(orderId, sortBySku([...lines.values()]));
  }
  return result;
}

function sortBySku<T extends { sku: string }>(lines: T[]): T[] {
  return lines.sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR"));
}

/** Consolida todos os itens de uma rota em linhas por produto e por vasilhame. */
export function buildCargoManifest(items: ReadonlyArray<CargoItemInput>): CargoManifest {
  const products = new Map<string, CargoProductLine>();
  let weightIncomplete = false;

  for (const item of items) {
    const weight = item.unitWeightGrams === null ? null : calcItemWeightGrams(item.quantityMilli, item.unitWeightGrams);
    if (weight === null) weightIncomplete = true;

    const line = products.get(item.productId);
    if (line) {
      line.quantityMilli += item.quantityMilli;
      line.weightGrams = line.weightGrams === null || weight === null ? null : line.weightGrams + weight;
    } else {
      products.set(item.productId, {
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        unit: item.unit,
        quantityMilli: item.quantityMilli,
        weightGrams: weight,
      });
    }
  }

  const containers = new Map<string, CargoContainerLine>();
  for (const lines of calcContainersByOrder(items).values()) {
    for (const line of lines) {
      const total = containers.get(line.productId);
      if (total) {
        total.count += line.count;
      } else {
        containers.set(line.productId, { ...line });
      }
    }
  }

  const productLines = sortBySku([...products.values()]);
  return {
    products: productLines,
    containers: sortBySku([...containers.values()]),
    totalWeightGrams: productLines.reduce((sum, line) => sum + (line.weightGrams ?? 0), 0),
    weightIncomplete,
    orderCount: new Set(items.map((item) => item.orderId)).size,
  };
}
