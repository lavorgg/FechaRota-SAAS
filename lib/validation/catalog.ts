// Cadastros (seção 5.4): produtos, veículos e clientes. Os mesmos schemas validam o
// formulário no navegador e a Server Action no servidor.

import { z } from "zod";

import { parseCep } from "../../domain/cep";
import { validateDocument } from "../../domain/document";
import { BRAZILIAN_STATES } from "../../domain/normalize";
import { PAYMENT_METHODS } from "../../domain/payment";
import { parsePlate } from "../../domain/plate";
import { PRODUCT_UNITS, parseQuantityToMilli } from "../../domain/quantity";
import { idSchema, moneySchema, optionalPhoneSchema, optionalPositiveIntSchema, optionalText } from "./common";

const requiredText = (label: string, max: number) =>
  z.string({ error: `Informe ${label}.` }).trim().min(1, `Informe ${label}.`).max(max, "Texto longo demais.");

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  status: z.enum(["ativos", "inativos", "todos"]).catch("ativos"),
});
export type ListQuery = z.output<typeof listQuerySchema>;

// ---------------------------------------------------------------------------
// Produto
// ---------------------------------------------------------------------------

export const skuSchema = z
  .string({ error: "Informe o SKU." })
  .trim()
  .toUpperCase()
  .min(1, "Informe o SKU.")
  .max(40, "SKU longo demais.")
  .regex(/^[A-Z0-9._/-]+$/, "Use só letras, números, ponto, traço, barra e sublinhado no SKU.");

/** Peso por unidade em kg ("1,050") -> gramas. Vazio = sem peso (o romaneio mostra "peso incompleto"). */
export const optionalWeightSchema = z
  .string()
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (!value || !value.trim()) return null;
    const result = parseQuantityToMilli(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: "Peso inválido. Use kg com até 3 casas, ex.: 1,050." });
      return z.NEVER;
    }
    return result.milli;
  });

const productFields = {
  sku: skuSchema,
  name: requiredText("o nome", 120),
  unit: z.enum(PRODUCT_UNITS, { error: "Escolha a unidade." }),
  price: moneySchema,
  weightKg: optionalWeightSchema,
  isReturnableContainer: z.boolean().default(false),
  containerProductId: z
    .string()
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  unitsPerContainer: optionalPositiveIntSchema(10_000, "Unidades por vasilhame"),
};

function productRules<T extends { isReturnableContainer: boolean; containerProductId: string | null; unitsPerContainer: number | null }>(value: T, ctx: z.RefinementCtx) {
  if (value.isReturnableContainer && value.containerProductId) {
    ctx.addIssue({ code: "custom", path: ["containerProductId"], message: "Um vasilhame não sai dentro de outro vasilhame." });
  }
  if (!value.containerProductId && value.unitsPerContainer !== null) {
    ctx.addIssue({ code: "custom", path: ["unitsPerContainer"], message: "Escolha o vasilhame antes de informar quantas unidades cabem nele." });
  }
}

export const productSchema = z.object(productFields).superRefine(productRules);
export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;

export const updateProductSchema = z.object({ id: idSchema, ...productFields }).superRefine(productRules);
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type UpdateProductData = z.output<typeof updateProductSchema>;

// ---------------------------------------------------------------------------
// Veículo
// ---------------------------------------------------------------------------

export const plateSchema = z.string({ error: "Informe a placa." }).transform((value, ctx) => {
  const result = parsePlate(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.plate;
});

const vehicleFields = {
  plate: plateSchema,
  model: requiredText("o modelo", 80),
  capacityKg: optionalPositiveIntSchema(100_000, "Capacidade"),
};

export const vehicleSchema = z.object(vehicleFields);
export type VehicleInput = z.input<typeof vehicleSchema>;
export type VehicleData = z.output<typeof vehicleSchema>;

export const updateVehicleSchema = z.object({ id: idSchema, ...vehicleFields });
export type UpdateVehicleInput = z.input<typeof updateVehicleSchema>;
export type UpdateVehicleData = z.output<typeof updateVehicleSchema>;

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export const optionalDocumentSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (!value) return null;
    const result = validateDocument(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.value;
  });

export const cepSchema = z.string({ error: "Informe o CEP." }).transform((value, ctx) => {
  const result = parseCep(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.cep;
});

function optionalCoordinate(min: number, max: number, label: string) {
  return z
    .string()
    .optional()
    .nullable()
    .transform((value, ctx) => {
      if (!value || !value.trim()) return null;
      const number = Number(value.trim().replace(",", "."));
      if (!Number.isFinite(number) || number < min || number > max) {
        ctx.addIssue({ code: "custom", message: `${label} inválida.` });
        return z.NEVER;
      }
      return number;
    });
}

const customerFields = {
  name: requiredText("o nome", 120),
  legalName: optionalText(160),
  document: optionalDocumentSchema,
  phone: optionalPhoneSchema,
  zipCode: cepSchema,
  street: requiredText("a rua", 160),
  number: requiredText("o número", 20),
  complement: optionalText(80),
  neighborhood: requiredText("o bairro", 80),
  city: requiredText("a cidade", 80),
  state: z.enum(BRAZILIAN_STATES, { error: "Escolha a UF." }),
  referencePoint: optionalText(160),
  latitude: optionalCoordinate(-90, 90, "Latitude"),
  longitude: optionalCoordinate(-180, 180, "Longitude"),
  defaultPaymentMethod: z.enum(PAYMENT_METHODS, { error: "Escolha a forma de pagamento." }),
  deliveryWindow: optionalText(60),
  notes: optionalText(500),
};

function customerRules<T extends { latitude: number | null; longitude: number | null }>(value: T, ctx: z.RefinementCtx) {
  if ((value.latitude === null) !== (value.longitude === null)) {
    ctx.addIssue({ code: "custom", path: [value.latitude === null ? "latitude" : "longitude"], message: "Informe latitude e longitude juntas." });
  }
}

export const customerSchema = z.object(customerFields).superRefine(customerRules);
export type CustomerInput = z.input<typeof customerSchema>;
export type CustomerData = z.output<typeof customerSchema>;

export const updateCustomerSchema = z.object({ id: idSchema, ...customerFields }).superRefine(customerRules);
export type UpdateCustomerInput = z.input<typeof updateCustomerSchema>;
export type UpdateCustomerData = z.output<typeof updateCustomerSchema>;

export const setActiveSchema = z.object({ id: idSchema, active: z.boolean() });
export const deleteSchema = z.object({ id: idSchema });
