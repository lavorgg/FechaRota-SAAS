// CEP: 8 dígitos, gravado sem traço.

export type ParseCepResult = { ok: true; cep: string } | { ok: false; error: string };

export function parseCep(input: string): ParseCepResult {
  const cep = input.replace(/\D/g, "");
  if (cep.length !== 8 || /^0{8}$/.test(cep)) return { ok: false, error: "CEP inválido. Use 8 dígitos." };
  return { ok: true, cep };
}

export function formatCep(cep: string): string {
  return /^\d{8}$/.test(cep) ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}
