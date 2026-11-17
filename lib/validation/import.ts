// Importação de clientes e produtos por CSV (seção 5.4). Cada linha é validada no navegador
// (pré-visualização) e de novo no servidor, com as mesmas regras do cadastro manual.

import { z } from "zod";

import { normalizeSearchText } from "../../domain/search";
import { PAYMENT_METHODS } from "../../domain/payment";
import { PRODUCT_UNITS } from "../../domain/quantity";
import { optionalPhoneSchema, optionalPositiveIntSchema, optionalText, moneySchema } from "./common";
import { cepSchema, optionalDocumentSchema, optionalWeightSchema, skuSchema } from "./catalog";
import { BRAZILIAN_STATES } from "../../domain/normalize";

/** Linhas por envio ao servidor (limite de corpo das Server Actions: seção 3.12). */
export const IMPORT_BATCH_SIZE = 200;

export const PRODUCT_IMPORT_COLUMNS = ["sku", "nome", "unidade", "preco", "peso_kg", "retornavel", "sku_vasilhame", "unidades_por_vasilhame"] as const;
export const PRODUCT_IMPORT_REQUIRED = ["sku", "nome", "unidade", "preco"] as const;
export type ProductImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number];

export const CUSTOMER_IMPORT_COLUMNS = [
  "nome",
  "razao_social",
  "documento",
  "telefone",
  "cep",
  "rua",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "ponto_referencia",
  "forma_pagamento",
  "janela_entrega",
  "observacoes",
] as const;
export const CUSTOMER_IMPORT_REQUIRED = ["nome", "cep", "rua", "numero", "bairro", "cidade", "uf", "forma_pagamento"] as const;
export type CustomerImportColumn = (typeof CUSTOMER_IMPORT_COLUMNS)[number];

/** Modelos para download: cabeçalho + uma linha de exemplo. */
export const PRODUCT_IMPORT_TEMPLATE: string[][] = [
  [...PRODUCT_IMPORT_COLUMNS],
  ["CAIXA-PLAST", "Caixa plástica retornável", "UN", "25,00", "1,800", "sim", "", ""],
  ["LEITE-1L", "Leite integral 1L", "UN", "5,49", "1,050", "não", "CAIXA-PLAST", "12"],
  ["QJ-MUSS", "Queijo muçarela (kg)", "KG", "42,90", "1", "não", "", ""],
];
export const CUSTOMER_IMPORT_TEMPLATE: string[][] = [
  [...CUSTOMER_IMPORT_COLUMNS],
  [
    "Padaria Exemplo",
    "Padaria Exemplo Ltda",
    "11.222.333/0001-81",
    "(16) 99999-0001",
    "14010-000",
    "Rua General Osório",
    "410",
    "",
    "Centro",
    "Ribeirão Preto",
    "SP",
    "Ao lado da lotérica",
    "Dinheiro",
    "6h às 9h",
    "",
  ],
];

const YES = new Set(["sim", "s", "x", "1", "true", "verdadeiro"]);
const NO = new Set(["", "nao", "n", "0", "false", "falso"]);

const yesNoSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeSearchText(value);
  if (YES.has(normalized)) return true;
  if (NO.has(normalized)) return false;
  ctx.addIssue({ code: "custom", message: 'Use "sim" ou "não".' });
  return z.NEVER;
});

const unitSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.enum(PRODUCT_UNITS, { error: `Unidade inválida. Use ${PRODUCT_UNITS.join(", ")}.` }));

const paymentSchema = z
  .string()
  .transform((value) => normalizeSearchText(value).toUpperCase())
  .pipe(z.enum(PAYMENT_METHODS, { error: "Forma de pagamento inválida. Use Pix, Dinheiro, Boleto ou Faturado." }));

const stateSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.enum(BRAZILIAN_STATES, { error: "UF inválida." }));

const text = (label: string, max: number) => z.string().trim().min(1, `Informe ${label}.`).max(max, "Texto longo demais.");

export const productImportRowSchema = z
  .object({
    sku: skuSchema,
    nome: text("o nome", 120),
    unidade: unitSchema,
    preco: moneySchema,
    peso_kg: optionalWeightSchema,
    retornavel: yesNoSchema,
    sku_vasilhame: z
      .string()
      .transform((value) => value.trim().toUpperCase() || null),
    unidades_por_vasilhame: optionalPositiveIntSchema(10_000, "Unidades por vasilhame"),
  })
  .superRefine((value, ctx) => {
    if (value.retornavel && value.sku_vasilhame) {
      ctx.addIssue({ code: "custom", path: ["sku_vasilhame"], message: "Um vasilhame não sai dentro de outro vasilhame." });
    }
    if (!value.sku_vasilhame && value.unidades_por_vasilhame !== null) {
      ctx.addIssue({ code: "custom", path: ["unidades_por_vasilhame"], message: "Informe o sku_vasilhame junto." });
    }
    if (value.sku_vasilhame && value.sku_vasilhame === value.sku) {
      ctx.addIssue({ code: "custom", path: ["sku_vasilhame"], message: "O produto não pode ser o próprio vasilhame." });
    }
  });
export type ProductImportRow = z.output<typeof productImportRowSchema>;

export const customerImportRowSchema = z.object({
  nome: text("o nome", 120),
  razao_social: optionalText(160),
  documento: optionalDocumentSchema,
  telefone: optionalPhoneSchema,
  cep: cepSchema,
  rua: text("a rua", 160),
  numero: text("o número", 20),
  complemento: optionalText(80),
  bairro: text("o bairro", 80),
  cidade: text("a cidade", 80),
  uf: stateSchema,
  ponto_referencia: optionalText(160),
  forma_pagamento: paymentSchema,
  janela_entrega: optionalText(60),
  observacoes: optionalText(500),
});
export type CustomerImportRow = z.output<typeof customerImportRowSchema>;

export type RowValidation<T> = { ok: true; data: T } | { ok: false; error: string };

/** Valida uma linha e devolve o primeiro erro com o nome da coluna ("preco: Valor inválido."). */
export function validateImportRow<T>(schema: z.ZodType<T>, values: Record<string, string>): RowValidation<T> {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  const column = issue?.path[0];
  return { ok: false, error: column ? `${String(column)}: ${issue?.message}` : (issue?.message ?? "Linha inválida.") };
}

export const importBatchSchema = z.object({
  rows: z
    .array(z.object({ line: z.number().int().min(2), values: z.record(z.string(), z.string().max(1000)) }))
    .min(1)
    .max(IMPORT_BATCH_SIZE),
});
export type ImportBatch = z.output<typeof importBatchSchema>;

export type ImportBatchResult = {
  created: number;
  errors: Array<{ line: number; error: string }>;
};
