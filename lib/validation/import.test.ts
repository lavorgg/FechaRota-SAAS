import { describe, expect, it } from "vitest";

import { buildCsv, mapColumns, parseCsv } from "../../domain/csv";
import {
  CUSTOMER_IMPORT_COLUMNS,
  CUSTOMER_IMPORT_REQUIRED,
  CUSTOMER_IMPORT_TEMPLATE,
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_REQUIRED,
  PRODUCT_IMPORT_TEMPLATE,
  customerImportRowSchema,
  productImportRowSchema,
  validateImportRow,
} from "./import";

const product = { sku: "leite-1l", nome: "Leite", unidade: "un", preco: "5,49", peso_kg: "1,050", retornavel: "não", sku_vasilhame: "caixa", unidades_por_vasilhame: "12" };

describe("linha de produto", () => {
  it("converte os textos da planilha", () => {
    expect(validateImportRow(productImportRowSchema, product)).toEqual({
      ok: true,
      data: { sku: "LEITE-1L", nome: "Leite", unidade: "UN", preco: 549, peso_kg: 1050, retornavel: false, sku_vasilhame: "CAIXA", unidades_por_vasilhame: 12 },
    });
  });

  it.each([
    [{ preco: "5.49" }, "preco: Valor inválido. Use o formato 12,50."],
    [{ unidade: "LT" }, "unidade: Unidade inválida. Use CX, DZ, FD, KG, UN, PCT."],
    [{ retornavel: "talvez" }, 'retornavel: Use "sim" ou "não".'],
    [{ retornavel: "sim" }, "sku_vasilhame: Um vasilhame não sai dentro de outro vasilhame."],
    [{ sku_vasilhame: "", unidades_por_vasilhame: "12" }, "unidades_por_vasilhame: Informe o sku_vasilhame junto."],
    [{ sku: "" }, "sku: Informe o SKU."],
    [{ peso_kg: "1kg" }, "peso_kg: Peso inválido. Use kg com até 3 casas, ex.: 1,050."],
  ])("recusa %j com o nome da coluna", (override, error) => {
    expect(validateImportRow(productImportRowSchema, { ...product, ...override })).toEqual({ ok: false, error });
  });
});

describe("linha de cliente", () => {
  const values = Object.fromEntries(CUSTOMER_IMPORT_COLUMNS.map((column, i) => [column, CUSTOMER_IMPORT_TEMPLATE[1]?.[i] ?? ""]));

  it("o exemplo do modelo é válido", () => {
    const result = validateImportRow(customerImportRowSchema, values);
    expect(result).toMatchObject({ ok: true, data: { documento: "11222333000181", telefone: "5516999990001", cep: "14010000", uf: "SP", forma_pagamento: "DINHEIRO" } });
  });

  it("aceita forma de pagamento em qualquer grafia e recusa a desconhecida", () => {
    expect(validateImportRow(customerImportRowSchema, { ...values, forma_pagamento: "pix" })).toMatchObject({ ok: true, data: { forma_pagamento: "PIX" } });
    expect(validateImportRow(customerImportRowSchema, { ...values, forma_pagamento: "Cartão" })).toEqual({
      ok: false,
      error: "forma_pagamento: Forma de pagamento inválida. Use Pix, Dinheiro, Boleto ou Faturado.",
    });
  });

  it("recusa CPF/CNPJ inválido e UF inexistente", () => {
    expect(validateImportRow(customerImportRowSchema, { ...values, documento: "111.111.111-11" })).toEqual({ ok: false, error: "documento: CPF inválido." });
    expect(validateImportRow(customerImportRowSchema, { ...values, uf: "XX" })).toEqual({ ok: false, error: "uf: UF inválida." });
  });
});

describe("modelos para download", () => {
  it("o modelo de produtos é lido de volta sem erro, inclusive com vasilhame", () => {
    const parsed = parseCsv(buildCsv(PRODUCT_IMPORT_TEMPLATE));
    const mapped = mapColumns(parsed, PRODUCT_IMPORT_COLUMNS, PRODUCT_IMPORT_REQUIRED);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      for (const row of mapped.rows) expect(validateImportRow(productImportRowSchema, row.values).ok).toBe(true);
    }
  });

  it("o modelo de clientes é lido de volta sem erro", () => {
    const mapped = mapColumns(parseCsv(buildCsv(CUSTOMER_IMPORT_TEMPLATE)), CUSTOMER_IMPORT_COLUMNS, CUSTOMER_IMPORT_REQUIRED);
    expect(mapped.ok).toBe(true);
  });
});
