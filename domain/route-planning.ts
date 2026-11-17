// Montagem de rotas (seção 5.6). Módulo puro: agrupamento por cidade e bairro, totais,
// ordem sugerida das paradas e aviso de capacidade.

import { calcItemWeightGrams } from "./cargo-manifest";
import { normalizeSearchText } from "./search";
import { preferredOf } from "./spelling";

export type PlanningOrder = {
  id: string;
  orderNumber: number;
  customerName: string;
  city: string;
  cityKey: string;
  neighborhood: string;
  neighborhoodKey: string;
  street: string;
  number: string;
  totalCents: number;
  /** Peso por unidade em gramas; nulo = produto sem peso cadastrado. */
  items: ReadonlyArray<{ quantityMilli: number; unitWeightGrams: number | null }>;
};

export type LoadSummary = {
  orderCount: number;
  /** Soma dos pesos conhecidos, em gramas. */
  weightGrams: number;
  /** Algum produto sem peso: o total mostrado é parcial ("peso incompleto"). */
  weightIncomplete: boolean;
  /** Volumes = itens dos pedidos (decisão do dono do produto). */
  volumes: number;
  totalCents: number;
};

export type NeighborhoodGroup = LoadSummary & {
  /** "cidade|bairro" pelas chaves normalizadas. */
  key: string;
  neighborhood: string;
  orders: PlanningOrder[];
};

export type CityGroup = LoadSummary & { cityKey: string; city: string; neighborhoods: NeighborhoodGroup[] };

export function orderWeight(order: Pick<PlanningOrder, "items">): { grams: number; incomplete: boolean } {
  let grams = 0;
  let incomplete = false;
  for (const item of order.items) {
    if (item.unitWeightGrams === null) incomplete = true;
    else grams += calcItemWeightGrams(item.quantityMilli, item.unitWeightGrams);
  }
  return { grams, incomplete };
}

export function summarizeLoad(orders: ReadonlyArray<Pick<PlanningOrder, "items" | "totalCents">>): LoadSummary {
  const summary: LoadSummary = { orderCount: orders.length, weightGrams: 0, weightIncomplete: false, volumes: 0, totalCents: 0 };
  for (const order of orders) {
    const weight = orderWeight(order);
    summary.weightGrams += weight.grams;
    summary.weightIncomplete ||= weight.incomplete;
    summary.volumes += order.items.length;
    summary.totalCents += order.totalCents;
  }
  return summary;
}

/** Número da casa para ordenar: "410" < "1250"; "12A" depois de "12"; "s/n" por último. */
function houseNumberKey(number: string): [number, string] {
  const match = /^\s*(\d+)/.exec(number);
  return [match ? Number(match[1]) : Number.MAX_SAFE_INTEGER, normalizeSearchText(number)];
}

/**
 * Ordem sugerida das paradas: cidade, bairro, rua e número. É uma ordenação simples, não
 * uma otimização de trajeto (seção 1: o MVP não otimiza rotas).
 */
export function suggestStopOrder<T extends Pick<PlanningOrder, "cityKey" | "neighborhoodKey" | "street" | "number" | "orderNumber">>(orders: ReadonlyArray<T>): T[] {
  return [...orders].sort((a, b) => {
    const byPlace = a.cityKey.localeCompare(b.cityKey, "pt-BR") || a.neighborhoodKey.localeCompare(b.neighborhoodKey, "pt-BR");
    if (byPlace) return byPlace;
    const byStreet = normalizeSearchText(a.street).localeCompare(normalizeSearchText(b.street), "pt-BR");
    if (byStreet) return byStreet;
    const [na, sa] = houseNumberKey(a.number);
    const [nb, sb] = houseNumberKey(b.number);
    return na - nb || sa.localeCompare(sb, "pt-BR") || a.orderNumber - b.orderNumber;
  });
}

/** Agrupa por cidade e bairro (chaves normalizadas), mostrando a grafia mais usada. */
export function groupByCityAndNeighborhood(orders: ReadonlyArray<PlanningOrder>): CityGroup[] {
  const cities = new Map<string, Map<string, PlanningOrder[]>>();
  for (const order of orders) {
    const neighborhoods = cities.get(order.cityKey) ?? new Map<string, PlanningOrder[]>();
    neighborhoods.set(order.neighborhoodKey, [...(neighborhoods.get(order.neighborhoodKey) ?? []), order]);
    cities.set(order.cityKey, neighborhoods);
  }

  const result: CityGroup[] = [];
  for (const [cityKey, neighborhoods] of cities) {
    const groups: NeighborhoodGroup[] = [...neighborhoods].map(([neighborhoodKey, list]) => ({
      key: `${cityKey}|${neighborhoodKey}`,
      neighborhood: preferredOf(list.map((order) => order.neighborhood)),
      orders: suggestStopOrder(list),
      ...summarizeLoad(list),
    }));
    groups.sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, "pt-BR"));
    const all = groups.flatMap((group) => group.orders);
    result.push({ cityKey, city: preferredOf(all.map((order) => order.city)), neighborhoods: groups, ...summarizeLoad(all) });
  }
  return result.sort((a, b) => a.city.localeCompare(b.city, "pt-BR"));
}

/** Aviso (não bloqueio) de peso acima da capacidade do veículo (seção 5.6). */
export function exceedsCapacity(weightGrams: number, capacityKg: number | null): boolean {
  return capacityKg !== null && weightGrams > capacityKg * 1000;
}
