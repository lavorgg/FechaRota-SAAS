// Cadastros (seção 5.4): veículos, produtos e clientes.

import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { MESSAGES, ServiceError } from "@/lib/errors";
import { DOCUMENT_IN_USE, createCustomer, deleteCustomer, getCustomer, listCustomers, setCustomerActive, updateCustomer } from "@/lib/services/customers";
import { PRODUCT_MESSAGES, createProduct, deleteProduct, listContainerOptions, listProducts, updateProduct } from "@/lib/services/products";
import { createVehicle, deleteVehicle, listVehicles, setVehicleActive, updateVehicle } from "@/lib/services/vehicles";
import { customerSchema, productSchema, vehicleSchema } from "@/lib/validation/catalog";

import { type CompanyFixture, cleanDatabase, contextOf, createCompanyFixture } from "./fixtures";

let a: CompanyFixture;
let b: CompanyFixture;
let expedicao: { id: string; companyId: string; role: "EXPEDICAO" };

beforeAll(async () => {
  await cleanDatabase();
  a = await createCompanyFixture("A");
  b = await createCompanyFixture("B");
  const user = await prisma.user.create({ data: { companyId: a.companyId, name: "Exp", email: "exp-cat@teste.local", role: "EXPEDICAO", passwordHash: "x" } });
  expedicao = { id: user.id, companyId: a.companyId, role: "EXPEDICAO" };
});

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

const list = { page: 1, status: "ativos" as const, q: undefined };

const customerInput = (overrides: Record<string, unknown> = {}) =>
  customerSchema.parse({
    name: "Mercado São José",
    legalName: "",
    document: "",
    phone: "(16) 98765-4321",
    zipCode: "14010-000",
    street: "Rua Tibiriçá",
    number: "100",
    neighborhood: "Vila Tibério",
    city: "Ribeirão Preto",
    state: "SP",
    defaultPaymentMethod: "PIX",
    ...overrides,
  });

describe("permissões dos cadastros", () => {
  it("EXPEDICAO cadastra; MOTORISTA não", async () => {
    await expect(createVehicle(contextOf(expedicao), vehicleSchema.parse({ plate: "EXP1A11", model: "Van" }))).resolves.toMatchObject({ plate: "EXP1A11" });
    const driver = contextOf(a.driver);
    expect((await rejection(listCustomers(driver, list))).code).toBe("SEM_PERMISSAO");
    expect((await rejection(createProduct(driver, productSchema.parse({ sku: "X", name: "X", unit: "UN", price: "1,00" })))).code).toBe("SEM_PERMISSAO");
  });

  it("plano em atraso não grava", async () => {
    const error = await rejection(createVehicle(contextOf(a.admin, "PAST_DUE"), vehicleSchema.parse({ plate: "ATR1A11", model: "Van" })));
    expect(error.message).toBe(MESSAGES.readOnly);
  });
});

describe("veículos", () => {
  it("placa normalizada e única por empresa; mesma placa em outra empresa pode", async () => {
    const vehicle = await createVehicle(contextOf(a.admin), vehicleSchema.parse({ plate: "abc-9z99", model: "HR", capacityKg: "1500" }));
    expect(vehicle).toMatchObject({ plate: "ABC9Z99", capacityKg: 1500, active: true });
    const dup = await rejection(createVehicle(contextOf(a.admin), vehicleSchema.parse({ plate: "ABC9Z99", model: "Outro" })));
    expect(dup.fieldErrors).toEqual({ plate: "Já existe um veículo com esta placa." });
    await expect(createVehicle(contextOf(b.admin), vehicleSchema.parse({ plate: "ABC9Z99", model: "HR" }))).resolves.toBeTruthy();
  });

  it("busca, inativa e exclui (só sem vínculo)", async () => {
    const free = await createVehicle(contextOf(a.admin), vehicleSchema.parse({ plate: "LIV1E00", model: "Fiorino" }));
    expect((await listVehicles(contextOf(a.admin), { ...list, q: "liv-1e" })).items.map((v) => v.plate)).toEqual(["LIV1E00"]);
    await setVehicleActive(contextOf(a.admin), free.id, false);
    expect((await listVehicles(contextOf(a.admin), { ...list, status: "inativos" })).items.map((v) => v.plate)).toContain("LIV1E00");
    await deleteVehicle(contextOf(a.admin), free.id);
    // O veículo da fixture está em uma rota.
    expect((await rejection(deleteVehicle(contextOf(a.admin), a.vehicle.id))).message).toBe(MESSAGES.linkedRecords);
  });

  it("outra empresa não edita (404)", async () => {
    expect((await rejection(updateVehicle(contextOf(b.admin), { id: a.vehicle.id, ...vehicleSchema.parse({ plate: "ZZZ1Z11", model: "x" }) }))).code).toBe("NAO_ENCONTRADO");
  });
});

describe("produtos", () => {
  it("preço em centavos, peso em gramas, SKU em maiúsculas", async () => {
    const product = await createProduct(contextOf(a.admin), productSchema.parse({ sku: "qj-prato", name: "Queijo prato", unit: "KG", price: "39,90", weightKg: "1" }));
    expect(product).toMatchObject({ sku: "QJ-PRATO", priceCents: 3990, weightGrams: 1000, unit: "KG" });
    const dup = await rejection(createProduct(contextOf(a.admin), productSchema.parse({ sku: "QJ-PRATO", name: "Outro", unit: "KG", price: "1,00" })));
    expect(dup.fieldErrors).toEqual({ sku: PRODUCT_MESSAGES.skuInUse });
  });

  it("vasilhame precisa ser retornável, ativo e da mesma empresa", async () => {
    expect((await listContainerOptions(contextOf(a.admin))).map((c) => c.sku)).toEqual(["CAIXA"]);
    const ok = await createProduct(contextOf(a.admin), productSchema.parse({ sku: "IOG", name: "Iogurte", unit: "UN", price: "3,29", containerProductId: a.container.id, unitsPerContainer: "24" }));
    expect(ok).toMatchObject({ containerSku: "CAIXA", unitsPerContainer: 24 });

    const notContainer = await rejection(createProduct(contextOf(a.admin), productSchema.parse({ sku: "X1", name: "X", unit: "UN", price: "1,00", containerProductId: a.product.id })));
    expect(notContainer.fieldErrors).toEqual({ containerProductId: PRODUCT_MESSAGES.invalidContainer });
    const foreign = await rejection(createProduct(contextOf(b.admin), productSchema.parse({ sku: "X2", name: "X", unit: "UN", price: "1,00", containerProductId: a.container.id })));
    expect(foreign.fieldErrors).toEqual({ containerProductId: PRODUCT_MESSAGES.invalidContainer });
  });

  it("não deixa desmarcar retornável de vasilhame em uso", async () => {
    const error = await rejection(
      updateProduct(contextOf(a.admin), { id: a.container.id, ...productSchema.parse({ sku: "CAIXA", name: "Caixa", unit: "UN", price: "25,00", isReturnableContainer: false }) }),
    );
    expect(error.message).toMatch(/Este vasilhame está ligado a \d+ produtos?/);
  });

  it("mudar o preço não altera itens de pedidos já lançados (cópia no pedido)", async () => {
    await updateProduct(contextOf(a.admin), { id: a.product.id, ...productSchema.parse({ sku: "LEITE-1L", name: "Leite 1L novo", unit: "UN", price: "9,99", containerProductId: a.container.id, unitsPerContainer: "12" }) });
    const item = await prisma.orderItem.findUniqueOrThrow({ where: { id: a.orderItem.id } });
    expect(item).toMatchObject({ productName: "Leite 1L", unitPriceCents: 549 });
  });

  it("busca sem acento por SKU ou nome", async () => {
    await createProduct(contextOf(a.admin), productSchema.parse({ sku: "PAO-FRANCES", name: "Pão francês", unit: "KG", price: "15,00" }));
    expect((await listProducts(contextOf(a.admin), { ...list, q: "PAO" })).items.map((p) => p.sku)).toEqual(["PAO-FRANCES"]);
    expect((await listProducts(contextOf(a.admin), { ...list, q: "francês" })).items.map((p) => p.sku)).toEqual(["PAO-FRANCES"]);
  });

  it("produto com pedido não é excluído", async () => {
    expect((await rejection(deleteProduct(contextOf(a.admin), a.product.id))).message).toBe(MESSAGES.linkedRecords);
  });
});

describe("clientes", () => {
  it("guarda chaves normalizadas e texto de busca", async () => {
    const customer = await createCustomer(contextOf(a.admin), customerInput());
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row).toMatchObject({ neighborhoodKey: "vila tiberio", cityKey: "ribeirao preto", phone: "5516987654321", zipCode: "14010000" });
    expect(row.searchText).toContain("mercado sao jose");
  });

  it("busca por nome, bairro ou telefone, sem acento", async () => {
    for (const q of ["sao jose", "TIBERIO", "98765", "(16) 98765-4321"]) {
      expect((await listCustomers(contextOf(a.admin), { ...list, q })).items.map((c) => c.name), q).toContain("Mercado São José");
    }
  });

  it("CPF/CNPJ único por empresa", async () => {
    await createCustomer(contextOf(a.admin), customerInput({ name: "Com CNPJ", document: "11.222.333/0001-81" }));
    const dup = await rejection(createCustomer(contextOf(a.admin), customerInput({ name: "Outro", document: "11222333000181" })));
    expect(dup.fieldErrors).toEqual({ document: DOCUMENT_IN_USE });
    await expect(createCustomer(contextOf(b.admin), customerInput({ name: "Na B", document: "11222333000181" }))).resolves.toBeTruthy();
  });

  it("editar o cadastro não muda a cópia do endereço nos pedidos (seção 3.7)", async () => {
    await updateCustomer(contextOf(a.admin), { id: a.customer.id, ...customerInput({ name: "Cliente A", street: "Rua Nova", number: "999" }) });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } });
    expect(order).toMatchObject({ deliveryStreet: "Rua Um", deliveryNumber: "10" });
  });

  it("inativar, isolamento e exclusão", async () => {
    const customer = await createCustomer(contextOf(a.admin), customerInput({ name: "Temporário" }));
    await setCustomerActive(contextOf(a.admin), customer.id, false);
    expect((await listCustomers(contextOf(a.admin), { ...list, q: "temporario" })).items).toEqual([]);
    expect((await rejection(getCustomer(contextOf(b.admin), customer.id))).code).toBe("NAO_ENCONTRADO");
    await deleteCustomer(contextOf(a.admin), customer.id);
    expect((await rejection(deleteCustomer(contextOf(a.admin), a.customer.id))).message).toBe(MESSAGES.linkedRecords);
  });

  it("latitude e longitude vão juntas", () => {
    expect(customerSchema.safeParse({ ...customerInput(), latitude: "-21.17", longitude: "" }).success).toBe(false);
  });
});
