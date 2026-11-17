import { describe, expect, it } from "vitest";
import { z } from "zod";

import { describeErrorForLog, zodFieldErrors } from "./errors";

describe("zodFieldErrors", () => {
  it("devolve o primeiro erro de cada campo", () => {
    const schema = z.object({ name: z.string().min(2, "curto").max(3, "longo"), email: z.email("e-mail") });
    const result = schema.safeParse({ name: "a", email: "x" });
    expect(result.success).toBe(false);
    if (!result.success) expect(zodFieldErrors(result.error)).toEqual({ name: "curto", email: "e-mail" });
  });
});

describe("describeErrorForLog", () => {
  it("leva nome, código e pilha, mas nunca a mensagem (que pode ter dados)", () => {
    const error = Object.assign(new Error('Argumento inválido: { passwordHash: "$2b$12$segredo", document: "52998224725" }'), { code: "P2009" });
    const text = describeErrorForLog(error);
    expect(text.split("\n")[0]).toBe("Error (P2009)");
    expect(text).toContain("at ");
    expect(text).not.toContain("segredo");
    expect(text).not.toContain("52998224725");
  });

  it("não quebra com valores que não são Error", () => {
    expect(describeErrorForLog("texto")).toBe("erro não identificado");
    expect(describeErrorForLog(null)).toBe("erro não identificado");
  });
});
