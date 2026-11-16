import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { COMPANY_MODEL, FORBIDDEN_MODELS, TENANT_MODELS, TenantIsolationError, scopeArgsToCompany } from "./tenant-scope";

const A = "company-a";
const B = "company-b";

describe("classificação dos modelos", () => {
  const schema = readFileSync(path.resolve(import.meta.dirname, "../prisma/schema.prisma"), "utf8");
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((match) => ({
    name: match[1] ?? "",
    hasCompanyId: /^\s+companyId\s+String\b/m.test(match[2] ?? ""),
  }));

  it("o schema foi lido", () => {
    expect(models.length).toBeGreaterThanOrEqual(15);
  });

  it("todo modelo do schema está classificado (nenhum modelo novo passa despercebido)", () => {
    const classified = [...TENANT_MODELS, COMPANY_MODEL, ...FORBIDDEN_MODELS].sort();
    expect(models.map((m) => m.name).sort()).toEqual(classified);
  });

  it("todo modelo com companyId é filtrado, e só eles", () => {
    expect(models.filter((m) => m.hasCompanyId).map((m) => m.name).sort()).toEqual([...TENANT_MODELS].sort());
  });
});

describe("leituras", () => {
  it.each(["findUnique", "findUniqueOrThrow"])("%s ganha companyId no where", (operation) => {
    expect(scopeArgsToCompany("Order", operation, { where: { id: "o1" } }, A)).toEqual({
      where: { id: "o1", companyId: A },
    });
  });

  it("where único não consegue apontar para outra empresa", () => {
    const args = scopeArgsToCompany("Order", "findUnique", { where: { id: "o1", companyId: B } }, A);
    expect(args.where).toEqual({ id: "o1", companyId: A });
  });

  it.each(["findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"])(
    "%s combina o filtro do chamador com AND companyId",
    (operation) => {
      expect(scopeArgsToCompany("Order", operation, { where: { status: "PENDENTE" } }, A)).toEqual({
        where: { AND: [{ status: "PENDENTE" }, { companyId: A }] },
      });
      expect(scopeArgsToCompany("Order", operation, undefined, A)).toEqual({ where: { companyId: A } });
      expect(scopeArgsToCompany("Order", operation, {}, A)).toEqual({ where: { companyId: A } });
    },
  );

  it("um OR ou um companyId de outra empresa no filtro não vaza", () => {
    const hostile = { OR: [{ companyId: B }, { status: "PENDENTE" }] };
    expect(scopeArgsToCompany("Order", "findMany", { where: hostile }, A).where).toEqual({
      AND: [hostile, { companyId: A }],
    });
    expect(scopeArgsToCompany("Order", "findMany", { where: { companyId: B } }, A).where).toEqual({
      AND: [{ companyId: B }, { companyId: A }],
    });
  });

  it("preserva select, include, orderBy e paginação", () => {
    const args = { where: { id: "o1" }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 10 };
    expect(scopeArgsToCompany("Order", "findMany", args, A)).toMatchObject({
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });

  it("não altera o objeto recebido", () => {
    const args = { where: { id: "o1" } };
    scopeArgsToCompany("Order", "findUnique", args, A);
    expect(args).toEqual({ where: { id: "o1" } });
  });
});

describe("gravações", () => {
  it("create injeta companyId", () => {
    expect(scopeArgsToCompany("Vehicle", "create", { data: { plate: "ABC1D23", model: "HR" } }, A)).toEqual({
      data: { plate: "ABC1D23", model: "HR", companyId: A },
    });
  });

  it("create com o companyId da própria empresa é aceito; de outra, recusado", () => {
    expect(() => scopeArgsToCompany("Vehicle", "create", { data: { plate: "X", companyId: A } }, A)).not.toThrow();
    expect(() => scopeArgsToCompany("Vehicle", "create", { data: { plate: "X", companyId: B } }, A)).toThrow(
      TenantIsolationError,
    );
  });

  it.each(["createMany", "createManyAndReturn"])("%s injeta companyId em cada linha", (operation) => {
    expect(scopeArgsToCompany("Vehicle", operation, { data: [{ plate: "X" }, { plate: "Y" }] }, A).data).toEqual([
      { plate: "X", companyId: A },
      { plate: "Y", companyId: A },
    ]);
    expect(() =>
      scopeArgsToCompany("Vehicle", operation, { data: [{ plate: "X" }, { plate: "Y", companyId: B }] }, A),
    ).toThrow(TenantIsolationError);
  });

  it.each(["update", "delete"])("%s ganha companyId no where", (operation) => {
    const args = scopeArgsToCompany("Order", operation, { where: { id: "o1", version: 3 }, data: { notes: "x" } }, A);
    expect(args.where).toEqual({ id: "o1", version: 3, companyId: A });
  });

  it.each(["updateMany", "updateManyAndReturn", "deleteMany"])("%s é filtrado por empresa", (operation) => {
    expect(scopeArgsToCompany("Order", operation, { where: { routeId: "r1" }, data: { notes: "x" } }, A).where).toEqual({
      AND: [{ routeId: "r1" }, { companyId: A }],
    });
    expect(scopeArgsToCompany("Order", operation, { data: { notes: "x" } }, A).where).toEqual({ companyId: A });
  });

  it("update não consegue mover o registro para outra empresa", () => {
    expect(() => scopeArgsToCompany("Order", "update", { where: { id: "o1" }, data: { companyId: B } }, A)).toThrow(
      "Não é permitido mover Order para outra empresa.",
    );
    expect(() => scopeArgsToCompany("Order", "updateMany", { data: { companyId: B } }, A)).toThrow(TenantIsolationError);
    // Repetir o próprio companyId é inofensivo e é removido do update.
    expect(scopeArgsToCompany("Order", "update", { where: { id: "o1" }, data: { companyId: A, notes: "x" } }, A).data).toEqual({
      notes: "x",
    });
  });

  it("upsert protege where, create e update", () => {
    const args = scopeArgsToCompany(
      "Product",
      "upsert",
      { where: { id: "p1" }, create: { sku: "X" }, update: { name: "Y" } },
      A,
    );
    expect(args).toEqual({
      where: { id: "p1", companyId: A },
      create: { sku: "X", companyId: A },
      update: { name: "Y" },
    });
    expect(() =>
      scopeArgsToCompany("Product", "upsert", { where: { id: "p1" }, create: { sku: "X" }, update: { companyId: B } }, A),
    ).toThrow(TenantIsolationError);
  });

  it("operações com where único exigem where", () => {
    expect(() => scopeArgsToCompany("Order", "update", { data: {} }, A)).toThrow(TenantIsolationError);
    expect(() => scopeArgsToCompany("Order", "findUnique", {}, A)).toThrow(TenantIsolationError);
  });

  it("create exige data", () => {
    expect(() => scopeArgsToCompany("Order", "create", {}, A)).toThrow(TenantIsolationError);
  });
});

describe("relações em data", () => {
  it('recusa a relação "company"', () => {
    expect(() =>
      scopeArgsToCompany("Vehicle", "create", { data: { plate: "X", company: { connect: { id: B } } } }, A),
    ).toThrow(TenantIsolationError);
    expect(() =>
      scopeArgsToCompany("Vehicle", "update", { where: { id: "v1" }, data: { company: { connect: { id: B } } } }, A),
    ).toThrow(TenantIsolationError);
  });

  it("recusa connect: conectar um id de outra empresa copiaria o companyId dela", () => {
    expect(() =>
      scopeArgsToCompany("Order", "update", { where: { id: "o1" }, data: { route: { connect: { id: "rota-de-B" } } } }, A),
    ).toThrow(/informe a chave estrangeira diretamente/);
    expect(() =>
      scopeArgsToCompany("Route", "update", { where: { id: "r1" }, data: { orders: { connect: [{ id: "pedido-de-B" }] } } }, A),
    ).toThrow(TenantIsolationError);
    expect(() =>
      scopeArgsToCompany("Order", "create", { data: { customer: { connect: { id: "c1" } } } }, A),
    ).toThrow(TenantIsolationError);
  });

  it("recusa connectOrCreate e set de relação, em qualquer profundidade", () => {
    expect(() =>
      scopeArgsToCompany(
        "Order",
        "create",
        { data: { items: { create: [{ product: { connectOrCreate: { where: { id: "p" }, create: {} } } }] } } },
        A,
      ),
    ).toThrow(TenantIsolationError);
    expect(() =>
      scopeArgsToCompany("Route", "update", { where: { id: "r1" }, data: { orders: { set: [{ id: "pedido-de-B" }] } } }, A),
    ).toThrow(/"set" de relação/);
    expect(() =>
      scopeArgsToCompany("Route", "upsert", { where: { id: "r1" }, create: {}, update: { orders: { set: [] , connect: { id: "x" } } } }, A),
    ).toThrow(TenantIsolationError);
  });

  it("permite create aninhado com chaves escalares e set de campo escalar", () => {
    const data = {
      customerId: "c1",
      items: { create: [{ productId: "p1", quantity: "2.750" }] },
      notes: { set: "texto" },
    };
    expect(() => scopeArgsToCompany("Order", "create", { data }, A)).not.toThrow();
    expect(() =>
      scopeArgsToCompany("DeliveryProof", "update", { where: { id: "d1" }, data: { photoFileKeys: { set: ["a", "b"] } } }, A),
    ).not.toThrow();
  });

  it("não inspeciona o conteúdo Json da auditoria", () => {
    const data = { entity: "Order", entityId: "o1", action: "x", before: { connect: "texto livre" }, after: { set: [{ a: 1 }] } };
    expect(() => scopeArgsToCompany("AuditLog", "create", { data }, A)).not.toThrow();
  });
});

describe("empresa, modelos proibidos e SQL cru", () => {
  it("Company só é lida e atualizada pelo próprio id", () => {
    expect(scopeArgsToCompany("Company", "findUnique", { where: { id: B } }, A).where).toEqual({ id: A });
    expect(scopeArgsToCompany("Company", "findMany", {}, A).where).toEqual({ id: A });
    expect(scopeArgsToCompany("Company", "findMany", { where: { name: "x" } }, A).where).toEqual({
      AND: [{ name: "x" }, { id: A }],
    });
    expect(scopeArgsToCompany("Company", "update", { where: { id: B }, data: { name: "x" } }, A).where).toEqual({ id: A });
  });

  it.each(["create", "createMany", "delete", "deleteMany", "upsert", "updateMany"])("Company recusa %s", (operation) => {
    expect(() => scopeArgsToCompany("Company", operation, { where: { id: A }, data: {} }, A)).toThrow(TenantIsolationError);
  });

  it("Company não deixa trocar o id nem conectar registros de fora", () => {
    expect(() => scopeArgsToCompany("Company", "update", { where: { id: A }, data: { id: B } }, A)).toThrow(TenantIsolationError);
    expect(() =>
      scopeArgsToCompany("Company", "update", { where: { id: A }, data: { users: { connect: { id: "u-de-B" } } } }, A),
    ).toThrow(TenantIsolationError);
  });

  it.each(["findMany", "findUnique", "create", "deleteMany"])("Session é inacessível (%s)", (operation) => {
    expect(() => scopeArgsToCompany("Session", operation, { where: {} }, A)).toThrow(
      "O modelo Session não é acessível pelo client por empresa.",
    );
  });

  it("modelo desconhecido é recusado (falha fechado)", () => {
    expect(() => scopeArgsToCompany("ModeloNovo", "findMany", {}, A)).toThrow(TenantIsolationError);
  });

  it.each(["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"])("recusa SQL cru (%s)", (operation) => {
    expect(() => scopeArgsToCompany(undefined, operation, {}, A)).toThrow(/SQL cru/);
  });

  it("operação desconhecida em modelo de negócio é recusada (falha fechado)", () => {
    expect(() => scopeArgsToCompany("Order", "operacaoDoFuturo", { where: {} }, A)).toThrow(TenantIsolationError);
  });
});
