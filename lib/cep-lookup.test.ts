import { describe, expect, it, vi } from "vitest";

import { CEP_TIMEOUT_MS, lookupCep } from "./cep-lookup";

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("lookupCep", () => {
  it("preenche rua, bairro, cidade e UF", async () => {
    const fetcher = vi.fn(() => json({ cep: "14010-000", logradouro: "Rua General Osório", bairro: "Centro", localidade: "Ribeirão Preto", uf: "SP" }));
    expect(await lookupCep("14010-000", fetcher as unknown as typeof fetch)).toEqual({ ok: true, street: "Rua General Osório", neighborhood: "Centro", city: "Ribeirão Preto", state: "SP" });
    expect(fetcher).toHaveBeenCalledWith("https://viacep.com.br/ws/14010000/json/", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("CEP inválido nem consulta", async () => {
    const fetcher = vi.fn();
    expect(await lookupCep("123", fetcher as unknown as typeof fetch)).toEqual({ ok: false, error: "CEP inválido. Use 8 dígitos." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("CEP inexistente, erro do serviço e falha de rede viram mensagem, nunca exceção", async () => {
    expect((await lookupCep("99999999", (() => json({ erro: true })) as unknown as typeof fetch)).ok).toBe(false);
    expect((await lookupCep("14010000", (() => json({}, 500)) as unknown as typeof fetch)).ok).toBe(false);
    expect((await lookupCep("14010000", (() => Promise.reject(new TypeError("rede"))) as unknown as typeof fetch)).ok).toBe(false);
  });

  it("desiste depois de 3 segundos", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("abortado", "AbortError"))));
      const pending = lookupCep("14010000", fetcher as unknown as typeof fetch);
      await vi.advanceTimersByTimeAsync(CEP_TIMEOUT_MS);
      expect(await pending).toEqual({ ok: false, error: "A busca do CEP demorou ou falhou. Preencha o endereço à mão." });
    } finally {
      vi.useRealTimers();
    }
  });
});
