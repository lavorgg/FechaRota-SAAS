import { describe, expect, it } from "vitest";

import { PERMISSIONS, type Permission, USER_ROLES, type UserRole, can, homePathFor, seesOnlyOwnRoutes } from "./permissions";

// A tabela da seção 5.1 escrita de novo, linha a linha, com as decisões do dono do produto:
// reabrir rota é só do ADMIN. Se alguém mexer na matriz, este teste acusa.
const SPEC: Record<Permission, Record<UserRole, boolean>> = {
  "painel.acessar": { ADMIN: true, EXPEDICAO: true, MOTORISTA: false },
  "motorista.acessar": { ADMIN: true, EXPEDICAO: false, MOTORISTA: true },
  "cadastros.gerenciar": { ADMIN: true, EXPEDICAO: true, MOTORISTA: false },
  "usuarios.gerenciar": { ADMIN: true, EXPEDICAO: false, MOTORISTA: false },
  "pedidos.gerenciar": { ADMIN: true, EXPEDICAO: true, MOTORISTA: false },
  "rotas.montar": { ADMIN: true, EXPEDICAO: true, MOTORISTA: false },
  "rotas.reabrir": { ADMIN: true, EXPEDICAO: false, MOTORISTA: false },
  "entregas.registrar": { ADMIN: true, EXPEDICAO: false, MOTORISTA: true },
  "acerto.realizar": { ADMIN: true, EXPEDICAO: true, MOTORISTA: false },
  "entregas.corrigir": { ADMIN: true, EXPEDICAO: false, MOTORISTA: false },
  // Não está na tabela da 5.1: tela de auditoria só ADMIN (decisão do dono do produto).
  "auditoria.consultar": { ADMIN: true, EXPEDICAO: false, MOTORISTA: false },
};

describe("matriz de permissões", () => {
  it("cobre exatamente as permissões da especificação", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(SPEC).sort());
  });

  const cases = (Object.keys(SPEC) as Permission[]).flatMap((permission) =>
    USER_ROLES.map((role) => [permission, role, SPEC[permission][role]] as const),
  );

  it.each(cases)("%s para %s = %s", (permission, role, expected) => {
    expect(can(role, permission)).toBe(expected);
  });

  it("o MOTORISTA não tem nenhuma permissão do painel", () => {
    const allowed = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can("MOTORISTA", p));
    expect(allowed.sort()).toEqual(["entregas.registrar", "motorista.acessar"]);
  });

  it("na área do motorista, só o MOTORISTA fica preso às próprias rotas (ADMIN vê todas)", () => {
    expect(USER_ROLES.filter((role) => seesOnlyOwnRoutes(role))).toEqual(["MOTORISTA"]);
  });

  it("início de cada papel", () => {
    expect(homePathFor("ADMIN")).toBe("/app/dashboard");
    expect(homePathFor("EXPEDICAO")).toBe("/app/dashboard");
    expect(homePathFor("MOTORISTA")).toBe("/motorista");
  });
});
