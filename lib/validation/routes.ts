// Rotas (seção 5.6) e configurações da empresa.

import { z } from "zod";

import { BRAZILIAN_STATES } from "../../domain/normalize";
import { cepSchema } from "./catalog";
import { dateStringSchema, idSchema, optionalCnpjSchema, optionalPhoneSchema, optionalText, versionSchema } from "./common";

export const MAX_ROUTE_STOPS = 200;

const orderIdsSchema = z
  .array(idSchema)
  .min(1, "Selecione pelo menos um pedido.")
  .max(MAX_ROUTE_STOPS, `Uma rota pode ter no máximo ${MAX_ROUTE_STOPS} paradas.`)
  .refine((ids) => new Set(ids).size === ids.length, "Pedido repetido na lista.");

const routeName = z.string({ error: "Informe o nome da rota." }).trim().min(2, "Informe o nome da rota.").max(80, "Nome longo demais.");
const vehicleId = z
  .string()
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

export const createRouteSchema = z.object({
  deliveryDate: dateStringSchema,
  name: routeName,
  driverId: z.string({ error: "Escolha o motorista." }).min(1, "Escolha o motorista."),
  vehicleId,
  orderIds: orderIdsSchema,
});
export type CreateRouteData = z.output<typeof createRouteSchema>;

const routeRef = { id: idSchema, version: versionSchema };

export const updateRouteSchema = z.object({ ...routeRef, name: routeName, driverId: z.string().min(1, "Escolha o motorista."), vehicleId });
export type UpdateRouteData = z.output<typeof updateRouteSchema>;

export const routeOrdersSchema = z.object({ ...routeRef, orderIds: orderIdsSchema });
export type RouteOrdersData = z.output<typeof routeOrdersSchema>;

export const removeRouteOrderSchema = z.object({ ...routeRef, orderId: idSchema });
export type RemoveRouteOrderData = z.output<typeof removeRouteOrderSchema>;

export const routeVersionSchema = z.object(routeRef);
export type RouteVersionData = z.output<typeof routeVersionSchema>;

export const reopenRouteSchema = z.object({ ...routeRef, reason: optionalText(300, "Motivo longo demais.") });
export type ReopenRouteData = z.output<typeof reopenRouteSchema>;

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

const optionalCoordinate = (min: number, max: number, label: string) =>
  z
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

const optionalTrimmed = (max: number) => optionalText(max);

export const companySettingsSchema = z
  .object({
    name: z.string({ error: "Informe o nome da empresa." }).trim().min(2, "Informe o nome da empresa.").max(120, "Nome longo demais."),
    cnpj: optionalCnpjSchema,
    phone: optionalPhoneSchema,
    depotZipCode: z
      .string()
      .optional()
      .nullable()
      .transform((value) => (value && value.trim() ? value : null))
      .pipe(cepSchema.nullable()),
    depotStreet: optionalTrimmed(160),
    depotNumber: optionalTrimmed(20),
    depotComplement: optionalTrimmed(80),
    depotNeighborhood: optionalTrimmed(80),
    depotCity: optionalTrimmed(80),
    depotState: z
      .string()
      .optional()
      .nullable()
      .transform((value) => (value ? value : null))
      .pipe(z.enum(BRAZILIAN_STATES, { error: "Escolha a UF." }).nullable()),
    depotLatitude: optionalCoordinate(-90, 90, "Latitude"),
    depotLongitude: optionalCoordinate(-180, 180, "Longitude"),
  })
  .superRefine((value, ctx) => {
    // Endereço do depósito: ou nada, ou o mínimo para o Maps achar (CEP, rua, número, bairro, cidade, UF).
    const required = ["depotZipCode", "depotStreet", "depotNumber", "depotNeighborhood", "depotCity", "depotState"] as const;
    const filled = required.filter((field) => value[field] !== null);
    if (filled.length > 0 && filled.length < required.length) {
      for (const field of required) {
        if (value[field] === null) ctx.addIssue({ code: "custom", path: [field], message: "Preencha o endereço completo do depósito ou deixe tudo vazio." });
      }
    }
    if ((value.depotLatitude === null) !== (value.depotLongitude === null)) {
      ctx.addIssue({ code: "custom", path: [value.depotLatitude === null ? "depotLatitude" : "depotLongitude"], message: "Informe latitude e longitude juntas." });
    }
  });
export type CompanySettingsInput = z.input<typeof companySettingsSchema>;
export type CompanySettingsData = z.output<typeof companySettingsSchema>;
