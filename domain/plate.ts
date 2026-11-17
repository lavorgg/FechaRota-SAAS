// Placa de veículo: padrão antigo (ABC1234) ou Mercosul (ABC1D23). Gravada sem traço, maiúscula.

export type ParsePlateResult = { ok: true; plate: string } | { ok: false; error: string };

export function parsePlate(input: string): ParsePlateResult {
  const plate = input.replace(/[\s-]/g, "").toUpperCase();
  if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) return { ok: true, plate };
  return { ok: false, error: "Placa inválida. Use ABC1234 ou ABC1D23." };
}

/** Exibição: antigo com traço (ABC-1234); Mercosul sem traço (ABC1D23). */
export function formatPlate(plate: string): string {
  return /^[A-Z]{3}\d{4}$/.test(plate) ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}
