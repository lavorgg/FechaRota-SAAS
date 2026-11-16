// Conversão de Decimal do Prisma (seção 3.2). Nenhum Decimal chega a um Client Component:
// todo mapper/DTO converte para inteiro em milésimos (ou em gramas, no caso de peso).

import { decimalStringToMilli } from "../../domain/quantity";

type DecimalLike = { toFixed(decimalPlaces: number): string };

/** Decimal(10,3) -> inteiro em milésimos: 2.750 -> 2750. */
export function decimalToMilli(value: DecimalLike): number {
  return decimalStringToMilli(value.toFixed(3));
}

export function nullableDecimalToMilli(value: DecimalLike | null): number | null {
  return value === null ? null : decimalToMilli(value);
}
