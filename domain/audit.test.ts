import { describe, expect, it } from "vitest";

import { auditActionLabel, auditChanges } from "./audit";

describe("auditoria legível", () => {
  it("nomes dos eventos em português; código desconhecido aparece como veio", () => {
    expect(auditActionLabel("ACERTO_CONCLUIDO")).toBe("Acerto concluído");
    expect(auditActionLabel("ALGO_NOVO")).toBe("ALGO_NOVO");
  });

  it("antes → depois com rótulos, valores em reais e situações traduzidas; só o que mudou", () => {
    expect(
      auditChanges(
        { status: "AGUARDANDO_ACERTO", paymentStatus: "PIX_A_CONFERIR", cashCents: 13_176 },
        { status: "CONCLUIDA", paymentStatus: "RECEBIDO", cashCents: 13_176, differenceCents: -176, active: false },
      ),
    ).toEqual([
      { field: "Situação", before: "Aguardando acerto", after: "Concluída" },
      { field: "Pagamento", before: "Pix a conferir", after: "Recebido" },
      { field: "Sobra/falta", before: "—", after: expect.stringMatching(/^-R\$\s1,76$/) },
      { field: "Ativo", before: "—", after: "Não" },
    ]);
  });

  it("nunca mostra senha, token ou documento", () => {
    expect(auditChanges({ passwordHash: "x", receiverDocument: "123" }, { passwordHash: "y", token: "z", document: "456", role: "ADMIN" })).toEqual([{ field: "Papel", before: "—", after: "Administrador" }]);
    expect(auditChanges(null, "texto")).toEqual([]);
  });
});
