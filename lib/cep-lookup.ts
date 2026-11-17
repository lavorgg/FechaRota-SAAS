// Busca de CEP no ViaCEP, feita pelo NAVEGADOR (seção 5.4): limite de 3 segundos e nenhuma
// falha bloqueia o cadastro, que pode ser preenchido à mão.

import { parseCep } from "../domain/cep";

export const CEP_TIMEOUT_MS = 3000;

export type CepLookupResult =
  | { ok: true; street: string; neighborhood: string; city: string; state: string }
  | { ok: false; error: string };

export async function lookupCep(input: string, fetcher: typeof fetch = fetch): Promise<CepLookupResult> {
  const parsed = parseCep(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CEP_TIMEOUT_MS);
  try {
    const response = await fetcher(`https://viacep.com.br/ws/${parsed.cep}/json/`, { signal: controller.signal });
    if (!response.ok) return { ok: false, error: "Não foi possível buscar o CEP agora. Preencha o endereço à mão." };
    const data = (await response.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (data.erro) return { ok: false, error: "CEP não encontrado. Confira o número ou preencha o endereço à mão." };
    return { ok: true, street: data.logradouro ?? "", neighborhood: data.bairro ?? "", city: data.localidade ?? "", state: data.uf ?? "" };
  } catch {
    return { ok: false, error: "A busca do CEP demorou ou falhou. Preencha o endereço à mão." };
  } finally {
    clearTimeout(timer);
  }
}
