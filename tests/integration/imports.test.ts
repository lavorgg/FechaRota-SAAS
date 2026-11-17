// Importação por CSV (seção 5.4): linhas válidas entram, repetidas e inválidas vão para o
// relatório, nada existente é alterado.

import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { importCustomers, importProducts } from "@/lib/services/imports";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
});

const product = (line: number, values: Record<string, string>) => ({
  line,
  values: { sku: "", nome: "Produto", unidade: "UN", preco: "1,00", peso_kg: "", retornavel: "não", sku_vasilhame: "", unidades_por_vasilhame: "", ...values },
});

describe("importar produtos", () => {
  it("cria vasilhame e produtos do mesmo lote, liga ao vasilhame já cadastrado e relata erros", async () => {
    const result = await importProducts(contextOf(a.admin), {
      rows: [
        product(2, { sku: "ENG", nome: "Engradado", retornavel: "sim" }),
        product(3, { sku: "CERV", nome: "Cerveja cx", unidade: "CX", preco: "139,00", sku_vasilhame: "ENG", unidades_por_vasilhame: "1" }),
        product(4, { sku: "IOG", nome: "Iogurte", preco: "3,29", sku_vasilhame: "CAIXA", unidades_por_vasilhame: "24" }),
        product(5, { sku: "LEITE-1L", nome: "Já existe" }),
        product(6, { sku: "CERV", nome: "Repetido no arquivo" }),
        product(7, { sku: "SEMVAS", nome: "Vasilhame inexistente", sku_vasilhame: "NAOTEM" }),
        product(8, { sku: "RUIM", preco: "abc" }),
      ],
    });
    expect(result).toEqual({
      created: 3,
      errors: [
        { line: 5, error: "sku: LEITE-1L já cadastrado." },
        { line: 6, error: "sku: CERV repetido no arquivo." },
        { line: 7, error: "sku_vasilhame: NAOTEM não é um vasilhame retornável cadastrado." },
        { line: 8, error: "preco: Valor inválido. Use o formato 12,50." },
      ],
    });
    const rows = await prisma.product.findMany({ where: { companyId: a.companyId, sku: { in: ["ENG", "CERV", "IOG"] } }, include: { containerProduct: true }, orderBy: { sku: "asc" } });
    expect(rows.map((p) => [p.sku, p.containerProduct?.sku ?? null, p.priceCents])).toEqual([
      ["CERV", "ENG", 13900],
      ["ENG", null, 100],
      ["IOG", "CAIXA", 329],
    ]);
    expect(rows.every((p) => p.searchText.length > 0)).toBe(true);
    // Nada existente foi alterado.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.product.id } })).name).toBe("Leite 1L");
  });

  it("reimportar o mesmo arquivo não duplica nem sobrescreve", async () => {
    const result = await importProducts(contextOf(a.admin), { rows: [product(2, { sku: "ENG", nome: "Outro nome", retornavel: "sim" })] });
    expect(result).toEqual({ created: 0, errors: [{ line: 2, error: "sku: ENG já cadastrado." }] });
  });

  it("vasilhame de outra empresa não serve; motorista não importa", async () => {
    const result = await importProducts(contextOf(b.admin), { rows: [product(2, { sku: "X", sku_vasilhame: "ENG" })] });
    expect(result.errors).toEqual([{ line: 2, error: "sku_vasilhame: ENG não é um vasilhame retornável cadastrado." }]);
    await expect(importProducts(contextOf(a.driver), { rows: [product(2, { sku: "Y" })] })).rejects.toMatchObject({ code: "SEM_PERMISSAO" });
  });
});

const customerRow = (line: number, values: Record<string, string>) => ({
  line,
  values: {
    nome: "Cliente CSV",
    razao_social: "",
    documento: "",
    telefone: "",
    cep: "14010-000",
    rua: "Rua A",
    numero: "1",
    complemento: "",
    bairro: "Centro",
    cidade: "Ribeirão Preto",
    uf: "SP",
    ponto_referencia: "",
    forma_pagamento: "Pix",
    janela_entrega: "",
    observacoes: "",
    ...values,
  },
});

describe("importar clientes", () => {
  it("cria com chaves normalizadas; CPF/CNPJ repetido ou já cadastrado é recusado", async () => {
    await prisma.customer.update({ where: { id: a.customer.id }, data: { document: "52998224725" } });
    const result = await importCustomers(contextOf(a.admin), {
      rows: [
        customerRow(2, { nome: "Bar Novo", documento: "11.222.333/0001-81", bairro: "  CENTRO ", telefone: "(16) 99999-0002" }),
        customerRow(3, { nome: "Sem documento" }),
        customerRow(4, { nome: "Repetido", documento: "11222333000181" }),
        customerRow(5, { nome: "Já existe", documento: "529.982.247-25" }),
        customerRow(6, { nome: "UF ruim", uf: "ZZ" }),
      ],
    });
    expect(result).toEqual({
      created: 2,
      errors: [
        { line: 4, error: "documento: CPF/CNPJ repetido no arquivo." },
        { line: 5, error: "documento: CPF/CNPJ já cadastrado." },
        { line: 6, error: "uf: UF inválida." },
      ],
    });
    const created = await prisma.customer.findFirstOrThrow({ where: { companyId: a.companyId, name: "Bar Novo" } });
    expect(created).toMatchObject({ document: "11222333000181", neighborhood: "CENTRO", neighborhoodKey: "centro", phone: "5516999990002", defaultPaymentMethod: "PIX", zipCode: "14010000" });
    expect(created.searchText).toContain("bar novo");
  });

  it("o mesmo documento pode existir em outra empresa", async () => {
    expect((await importCustomers(contextOf(b.admin), { rows: [customerRow(2, { documento: "11222333000181" })] })).created).toBe(1);
  });
});
