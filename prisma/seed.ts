// Seed de demonstração (seção 8). Rode com `pnpm db:seed` (ou `pnpm db:reset` para recriar tudo).
//
// - Datas relativas a "hoje" em America/Sao_Paulo: funciona em qualquer dia.
// - Recusa rodar em produção e recusa rodar sobre um banco que já tem dados.
// - Os dados de negócio são gravados pelo client por empresa (getTenantDb), como no app.

import "dotenv/config";

import { calcContainersByOrder, type CargoItemInput } from "../domain/cargo-manifest";
import { DAYS_OF_WEEK, type DayOfWeek, addDays, dateStringToDbDate, dayOfWeekOfDateString, todayInTimeZone } from "../domain/dates";
import { calcCNPJCheckDigits } from "../domain/document";
import { normalizeKey } from "../domain/normalize";
import { type PaymentMethod, calcAmountToCollectCents, initialPaymentStatus } from "../domain/payment";
import { type ProductUnit, calcSubtotalCents, milliToDecimalString } from "../domain/quantity";
import { hashPassword } from "../lib/auth/password";
import { COUNTER_KEYS, formatRouteCode, nextCounterValue } from "../lib/counters";
import { prisma } from "../lib/db";
import { putObjectFromScript } from "../lib/storage/admin";
import { buildProofFileKey } from "../lib/storage/keys";
import { type TenantDb, getTenantDb } from "../lib/tenant-db";
import { samplePhotoPng, sampleSignaturePng } from "./seed-support/png";

const TIMEZONE = "America/Sao_Paulo";
const DEMO_PASSWORD = "fecharota123";

// ---------------------------------------------------------------------------
// Dados de exemplo
// ---------------------------------------------------------------------------

type ProductSeed = {
  sku: string;
  name: string;
  unit: ProductUnit;
  priceCents: number;
  weightGrams: number | null;
  isReturnableContainer?: boolean;
  containerSku?: string;
  unitsPerContainer?: number;
};

const PRODUCTS: ProductSeed[] = [
  // Retornáveis primeiro: os vendáveis apontam para eles.
  { sku: "CAIXA-PLAST", name: "Caixa plástica retornável", unit: "UN", priceCents: 2500, weightGrams: 1800, isReturnableContainer: true },
  { sku: "ENGRADADO", name: "Engradado retornável 24 garrafas", unit: "UN", priceCents: 3500, weightGrams: 2200, isReturnableContainer: true },
  { sku: "LEITE-1L", name: "Leite integral 1L", unit: "UN", priceCents: 549, weightGrams: 1050, containerSku: "CAIXA-PLAST", unitsPerContainer: 12 },
  { sku: "IOG-170", name: "Iogurte natural 170g", unit: "UN", priceCents: 329, weightGrams: 180, containerSku: "CAIXA-PLAST", unitsPerContainer: 24 },
  { sku: "CERV-600-CX", name: "Cerveja 600ml caixa c/ 24", unit: "CX", priceCents: 13900, weightGrams: 24000, containerSku: "ENGRADADO", unitsPerContainer: 1 },
  { sku: "QJ-MUSS", name: "Queijo muçarela (kg)", unit: "KG", priceCents: 4290, weightGrams: 1000 },
  { sku: "REFRI-2L-FD", name: "Refrigerante 2L fardo c/ 6", unit: "FD", priceCents: 4590, weightGrams: 12600 },
  { sku: "OVOS-DZ", name: "Ovos brancos (dúzia)", unit: "DZ", priceCents: 1190, weightGrams: 720 },
];

type CustomerSeed = {
  name: string;
  legalName?: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  zipCode: string;
  referencePoint?: string;
  paymentMethod: PaymentMethod;
  deliveryWindow?: string;
  latitude?: number;
  longitude?: number;
};

// 3 bairros de Ribeirão Preto + 1 bairro de Sertãozinho. As grafias de "Centro" são
// inconsistentes de propósito: todas precisam cair no mesmo grupo.
const CUSTOMERS: CustomerSeed[] = [
  { name: "Padaria Pão Quente", legalName: "Pão Quente Panificadora Ltda", street: "Rua General Osório", number: "410", neighborhood: "Centro", city: "Ribeirão Preto", zipCode: "14010000", referencePoint: "Ao lado da lotérica", paymentMethod: "DINHEIRO", deliveryWindow: "6h às 9h", latitude: -21.1775, longitude: -47.8103 },
  { name: "Bar do Zeca", street: "Rua Álvares Cabral", number: "88", neighborhood: "centro ", city: "Ribeirão Preto", zipCode: "14010080", paymentMethod: "PIX", deliveryWindow: "10h às 12h" },
  { name: "Mercearia Santa Rita", legalName: "Santa Rita Comércio de Alimentos ME", street: "Rua São Sebastião", number: "1250", neighborhood: "CENTRO", city: "Ribeirão Preto", zipCode: "14015040", referencePoint: "Esquina com a Rua Tibiriçá", paymentMethod: "BOLETO", deliveryWindow: "8h às 11h" },
  { name: "Lanchonete Ponto Certo", street: "Rua Duque de Caxias", number: "305", neighborhood: "Centro", city: "ribeirão preto", zipCode: "14015020", paymentMethod: "DINHEIRO" },
  { name: "Restaurante Sabor Mineiro", legalName: "Sabor Mineiro Restaurante Ltda", street: "Avenida Nove de Julho", number: "1820", neighborhood: "Jardim Paulista", city: "Ribeirão Preto", zipCode: "14025000", paymentMethod: "FATURADO", deliveryWindow: "7h às 10h", latitude: -21.1889, longitude: -47.8092 },
  { name: "Empório Jardim", street: "Rua Chile", number: "770", neighborhood: "Jardim  Paulista", city: "Ribeirão Preto", zipCode: "14020610", paymentMethod: "PIX" },
  { name: "Pizzaria Bella Massa", street: "Rua Camilo de Mattos", number: "1432", neighborhood: "jardim paulista", city: "Ribeirão Preto", zipCode: "14090210", referencePoint: "Portão verde nos fundos", paymentMethod: "BOLETO", deliveryWindow: "14h às 17h" },
  { name: "Mercadinho Tibério", street: "Rua Luiz da Cunha", number: "640", neighborhood: "Vila Tibério", city: "Ribeirão Preto", zipCode: "14050060", paymentMethod: "DINHEIRO", deliveryWindow: "7h às 12h" },
  { name: "Açougue Boi Gordo", street: "Rua Coronel Luiz da Silva Batista", number: "215", neighborhood: "Vila Tiberio", city: "Ribeirão Preto", zipCode: "14050100", paymentMethod: "PIX" },
  { name: "Cantina da Escola Dom Pedro", street: "Rua Martinico Prado", number: "97", neighborhood: "VILA TIBÉRIO", city: "Ribeirão Preto", zipCode: "14050050", referencePoint: "Entrada pelo portão lateral", paymentMethod: "FATURADO", deliveryWindow: "6h30 às 7h30" },
  { name: "Supermercado Bom Preço", legalName: "Bom Preço Supermercados Ltda", street: "Rua Barão do Rio Branco", number: "1500", neighborhood: "Centro", city: "Sertãozinho", zipCode: "14160500", paymentMethod: "BOLETO", deliveryWindow: "8h às 16h" },
  { name: "Bar e Mercearia do Tonho", street: "Rua Voluntário Otto Gomes Martins", number: "332", neighborhood: "Centro", city: "Sertaozinho", zipCode: "14160200", paymentMethod: "DINHEIRO" },
];

type ItemSpec = readonly [sku: string, quantityMilli: number];

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

type ProductRow = { id: string; sku: string; name: string; unit: ProductUnit; priceCents: number; weightGrams: number | null; containerSku: string | null; unitsPerContainer: number | null };
type CustomerRow = { id: string } & CustomerSeed;

function demoCnpj(index: number): string {
  const base = `${String(40_000_000 + index * 1_111)}0001`;
  return `${base}${calcCNPJCheckDigits(base)}`;
}

function demoPhone(index: number): string {
  return `55169999${String(1000 + index)}`;
}

/** Instante a partir de data de calendário + hora de São Paulo (UTC-3 fixo, sem horário de verão). */
function saoPauloInstant(dateString: string, time: string): Date {
  return new Date(`${dateString}T${time}:00-03:00`);
}

async function createCompany(params: { name: string; cnpj: string; phone: string }) {
  return prisma.company.create({
    data: {
      name: params.name,
      cnpj: params.cnpj,
      phone: params.phone,
      timezone: TIMEZONE,
      planStatus: "TRIAL",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      proofPolicy: "PHOTO_OR_SIGNATURE",
      counters: { create: [{ key: COUNTER_KEYS.order }, { key: COUNTER_KEYS.route }] },
    },
  });
}

async function createProducts(db: TenantDb, companyId: string, seeds: ProductSeed[]): Promise<Map<string, ProductRow>> {
  const bySku = new Map<string, ProductRow>();
  for (const seed of seeds) {
    const container = seed.containerSku ? bySku.get(seed.containerSku) : undefined;
    if (seed.containerSku && !container) throw new Error(`Vasilhame ${seed.containerSku} não encontrado no seed.`);
    const created = await db.product.create({
      data: {
        companyId,
        sku: seed.sku,
        name: seed.name,
        unit: seed.unit,
        priceCents: seed.priceCents,
        weightKg: seed.weightGrams === null ? null : milliToDecimalString(seed.weightGrams),
        isReturnableContainer: seed.isReturnableContainer ?? false,
        containerProductId: container?.id ?? null,
        unitsPerContainer: seed.unitsPerContainer ?? null,
      },
    });
    bySku.set(seed.sku, {
      id: created.id,
      sku: seed.sku,
      name: seed.name,
      unit: seed.unit,
      priceCents: seed.priceCents,
      weightGrams: seed.weightGrams,
      containerSku: seed.containerSku ?? null,
      unitsPerContainer: seed.unitsPerContainer ?? null,
    });
  }
  return bySku;
}

async function createCustomers(db: TenantDb, companyId: string, seeds: CustomerSeed[], indexOffset: number): Promise<CustomerRow[]> {
  const rows: CustomerRow[] = [];
  for (const [index, seed] of seeds.entries()) {
    const created = await db.customer.create({
      data: {
        companyId,
        name: seed.name,
        legalName: seed.legalName ?? null,
        document: demoCnpj(indexOffset + index),
        phone: demoPhone(indexOffset + index),
        zipCode: seed.zipCode,
        street: seed.street,
        number: seed.number,
        neighborhood: seed.neighborhood,
        city: seed.city,
        state: "SP",
        referencePoint: seed.referencePoint ?? null,
        latitude: seed.latitude ?? null,
        longitude: seed.longitude ?? null,
        neighborhoodKey: normalizeKey(seed.neighborhood),
        cityKey: normalizeKey(seed.city),
        defaultPaymentMethod: seed.paymentMethod,
        deliveryWindow: seed.deliveryWindow ?? null,
      },
    });
    rows.push({ id: created.id, ...seed });
  }
  return rows;
}

type CreatedOrder = {
  id: string;
  orderNumber: number;
  customer: CustomerRow;
  totalCents: number;
  amountToCollectCents: number;
  items: Array<{ id: string; product: ProductRow; quantityMilli: number; subtotalCents: number }>;
};

async function createOrder(
  db: TenantDb,
  companyId: string,
  products: Map<string, ProductRow>,
  params: { customer: CustomerRow; deliveryDate: string; items: readonly ItemSpec[]; recurringTemplateId?: string; notes?: string; invoiceNumber?: string },
): Promise<CreatedOrder> {
  const lines = params.items.map(([sku, quantityMilli]) => {
    const product = products.get(sku);
    if (!product) throw new Error(`Produto ${sku} não encontrado no seed.`);
    return { product, quantityMilli, subtotalCents: calcSubtotalCents(quantityMilli, product.priceCents) };
  });
  const totalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const { customer } = params;
  const paymentMethod = customer.paymentMethod;

  return db.$transaction(async (tx) => {
    const orderNumber = await nextCounterValue(tx, companyId, COUNTER_KEYS.order);
    const order = await tx.order.create({
      data: {
        companyId,
        orderNumber,
        customerId: customer.id,
        recurringTemplateId: params.recurringTemplateId ?? null,
        deliveryDate: dateStringToDbDate(params.deliveryDate),
        status: "PENDENTE",
        deliveryZipCode: customer.zipCode,
        deliveryStreet: customer.street,
        deliveryNumber: customer.number,
        deliveryNeighborhood: customer.neighborhood,
        deliveryCity: customer.city,
        deliveryState: "SP",
        deliveryReferencePoint: customer.referencePoint ?? null,
        deliveryNeighborhoodKey: normalizeKey(customer.neighborhood),
        deliveryCityKey: normalizeKey(customer.city),
        invoiceNumber: params.invoiceNumber ?? null,
        paymentMethod,
        totalCents,
        amountToCollectCents: calcAmountToCollectCents(paymentMethod, totalCents),
        paymentStatus: initialPaymentStatus(paymentMethod),
        notes: params.notes ?? null,
        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            productName: line.product.name,
            unit: line.product.unit,
            quantity: milliToDecimalString(line.quantityMilli),
            unitPriceCents: line.product.priceCents,
            subtotalCents: line.subtotalCents,
          })),
        },
      },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    return {
      id: order.id,
      orderNumber,
      customer,
      totalCents,
      amountToCollectCents: order.amountToCollectCents,
      items: order.items.map((item) => {
        const line = lines.find((l) => l.product.id === item.productId);
        if (!line) throw new Error("Item criado sem linha correspondente.");
        return { id: item.id, product: line.product, quantityMilli: line.quantityMilli, subtotalCents: line.subtotalCents };
      }),
    };
  });
}

/** Vasilhames que saem em um pedido, considerando as quantidades efetivamente entregues. */
function containersOf(products: Map<string, ProductRow>, orderId: string, items: Array<{ product: ProductRow; quantityMilli: number }>) {
  const inputs: CargoItemInput[] = items
    .filter((item) => item.quantityMilli > 0)
    .map((item) => {
      const container = item.product.containerSku ? products.get(item.product.containerSku) : undefined;
      return {
        orderId,
        productId: item.product.id,
        sku: item.product.sku,
        productName: item.product.name,
        unit: item.product.unit,
        quantityMilli: item.quantityMilli,
        unitWeightGrams: item.product.weightGrams,
        container: container
          ? { productId: container.id, sku: container.sku, name: container.name, unitsPerContainer: item.product.unitsPerContainer }
          : null,
      };
    });
  return calcContainersByOrder(inputs).get(orderId) ?? [];
}

async function uploadProofFile(db: TenantDb, params: { companyId: string; orderId: string; kind: "PHOTO" | "SIGNATURE"; body: Uint8Array; uploadedById: string; at: Date }): Promise<string> {
  const key = buildProofFileKey({ companyId: params.companyId, orderId: params.orderId, contentType: "image/png" });
  await putObjectFromScript({ companyId: params.companyId, key, body: params.body, contentType: "image/png" });
  await db.fileObject.create({
    data: {
      companyId: params.companyId,
      key,
      kind: params.kind,
      mimeType: "image/png",
      sizeBytes: params.body.byteLength,
      status: "CONFIRMED",
      uploadedById: params.uploadedById,
      createdAt: params.at,
      confirmedAt: params.at,
    },
  });
  return key;
}

// ---------------------------------------------------------------------------
// Empresa principal
// ---------------------------------------------------------------------------

async function seedMainCompany(today: string, passwordHash: string) {
  const yesterday = addDays(today, -1);
  const company = await createCompany({ name: "Distribuidora Exemplo", cnpj: demoCnpj(0), phone: "551633330000" });
  const companyId = company.id;
  const db = getTenantDb({ companyId });

  const user = (name: string, email: string, phone: string, role: "ADMIN" | "EXPEDICAO" | "MOTORISTA") =>
    db.user.create({ data: { companyId, name, email, phone, role, passwordHash } });
  const admin = await user("Ana Administradora", "admin@exemplo.test", "5516988880001", "ADMIN");
  const expedicao = await user("Edu Expedição", "expedicao@exemplo.test", "5516988880002", "EXPEDICAO");
  const driver1 = await user("Marcos Motorista", "motorista1@exemplo.test", "5516988880003", "MOTORISTA");
  await user("Mário Motorista", "motorista2@exemplo.test", "5516988880004", "MOTORISTA");

  const vehicle1 = await db.vehicle.create({ data: { companyId, plate: "FRT1A23", model: "Hyundai HR baú", capacityKg: 1500 } });
  await db.vehicle.create({ data: { companyId, plate: "FRT4B56", model: "Fiat Fiorino", capacityKg: 650 } });

  const products = await createProducts(db, companyId, PRODUCTS);
  const customers = await createCustomers(db, companyId, CUSTOMERS, 1);
  const customer = (index: number): CustomerRow => {
    const row = customers[index];
    if (!row) throw new Error(`Cliente ${index} não existe no seed.`);
    return row;
  };

  // --- Rota de ontem, já CONCLUIDA (pedidos nº 1 a 4) ---
  const o1 = await createOrder(db, companyId, products, { customer: customer(0), deliveryDate: yesterday, items: [["LEITE-1L", 24_000], ["OVOS-DZ", 10_000]], invoiceNumber: "000.012.345" });
  const o2 = await createOrder(db, companyId, products, { customer: customer(1), deliveryDate: yesterday, items: [["CERV-600-CX", 2_000], ["REFRI-2L-FD", 3_000]] });
  const o3 = await createOrder(db, companyId, products, { customer: customer(2), deliveryDate: yesterday, items: [["IOG-170", 48_000], ["QJ-MUSS", 3_250]], invoiceNumber: "000.012.346" });
  const o4 = await createOrder(db, companyId, products, { customer: customer(3), deliveryDate: yesterday, items: [["QJ-MUSS", 1_500], ["REFRI-2L-FD", 2_000]] });

  const routeSequence = await nextCounterValue(db, companyId, COUNTER_KEYS.route);
  const startedAt = saoPauloInstant(yesterday, "08:10");
  const finishedAt = saoPauloInstant(yesterday, "11:40");
  const closedAt = saoPauloInstant(yesterday, "17:30");
  const route = await db.route.create({
    data: {
      companyId,
      code: formatRouteCode(routeSequence),
      name: "Centro (manhã)",
      deliveryDate: dateStringToDbDate(yesterday),
      driverId: driver1.id,
      vehicleId: vehicle1.id,
      status: "CONCLUIDA",
      startedAt,
      finishedAt,
      closedAt,
      closedById: expedicao.id,
      cashHandedInCents: o1.amountToCollectCents,
      version: 5,
    },
  });
  await db.auditLog.create({ data: { companyId, userId: expedicao.id, entity: "Route", entityId: route.id, action: "ROTA_LIBERADA", before: { status: "RASCUNHO" }, after: { status: "LIBERADA_CARGA" }, createdAt: saoPauloInstant(yesterday, "07:20") } });

  type Outcome = {
    order: CreatedOrder;
    stop: number;
    time: string;
    outcome: "ENTREGUE" | "ENTREGUE_PARCIAL" | "NAO_ENTREGUE";
    /** Quantidade entregue por SKU quando diferente da pedida. */
    delivered?: Record<string, { quantityMilli: number; returnReason: string }>;
    paymentStatus: "RECEBIDO" | "FATURADO" | "NAO_RECEBIDO";
    cashCents: number;
    pixCents: number;
    returnedContainers: Record<string, number>;
    receiverName?: string;
    photos: number;
    signature: boolean;
    failureReason?: "ESTABELECIMENTO_FECHADO";
    failureNote?: string;
  };

  const outcomes: Outcome[] = [
    { order: o1, stop: 1, time: "08:35", outcome: "ENTREGUE", paymentStatus: "RECEBIDO", cashCents: o1.amountToCollectCents, pixCents: 0, returnedContainers: { "CAIXA-PLAST": 1 }, receiverName: "João Pereira", photos: 1, signature: true },
    { order: o2, stop: 2, time: "09:20", outcome: "ENTREGUE", paymentStatus: "RECEBIDO", cashCents: 0, pixCents: o2.amountToCollectCents, returnedContainers: { ENGRADADO: 2 }, receiverName: "José Carlos (Zeca)", photos: 0, signature: true },
    { order: o3, stop: 3, time: "10:15", outcome: "ENTREGUE_PARCIAL", delivered: { "IOG-170": { quantityMilli: 24_000, returnReason: "Cliente recusou: validade curta" } }, paymentStatus: "FATURADO", cashCents: 0, pixCents: 0, returnedContainers: {}, receiverName: "Rita Souza", photos: 2, signature: true },
    { order: o4, stop: 4, time: "11:05", outcome: "NAO_ENTREGUE", paymentStatus: "NAO_RECEBIDO", cashCents: 0, pixCents: 0, returnedContainers: {}, photos: 1, signature: false, failureReason: "ESTABELECIMENTO_FECHADO", failureNote: "Portas fechadas, ninguém atendeu o telefone." },
  ];

  for (const [index, entry] of outcomes.entries()) {
    const { order } = entry;
    const deliveredAt = saoPauloInstant(yesterday, entry.time);
    const deliveredItems = order.items.map((item) => {
      const override = entry.delivered?.[item.product.sku];
      const quantityMilli = entry.outcome === "NAO_ENTREGUE" ? 0 : (override?.quantityMilli ?? item.quantityMilli);
      return { item, quantityMilli, returnReason: override?.returnReason ?? null };
    });

    const signatureFileKey = entry.signature
      ? await uploadProofFile(db, { companyId, orderId: order.id, kind: "SIGNATURE", body: sampleSignaturePng(index + 1), uploadedById: driver1.id, at: deliveredAt })
      : null;
    const photoFileKeys: string[] = [];
    for (let photo = 0; photo < entry.photos; photo++) {
      photoFileKeys.push(await uploadProofFile(db, { companyId, orderId: order.id, kind: "PHOTO", body: samplePhotoPng(index * 3 + photo), uploadedById: driver1.id, at: deliveredAt }));
    }

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { routeId: route.id, stopSequence: entry.stop, status: entry.outcome, paymentStatus: entry.paymentStatus, version: { increment: 2 } },
      });
      for (const delivered of deliveredItems) {
        await tx.orderItem.update({
          where: { id: delivered.item.id },
          data: { deliveredQuantity: milliToDecimalString(delivered.quantityMilli), returnReason: delivered.returnReason },
        });
      }
      const proof = await tx.deliveryProof.create({
        data: {
          companyId,
          orderId: order.id,
          clientRequestId: crypto.randomUUID(),
          outcome: entry.outcome,
          deliveredAt,
          receivedAt: new Date(deliveredAt.getTime() + 45_000),
          receiverName: entry.receiverName ?? null,
          signatureFileKey,
          photoFileKeys,
          failureReason: entry.failureReason ?? null,
          failureNote: entry.failureNote ?? null,
          cashCollectedCents: entry.cashCents,
          pixCollectedCents: entry.pixCents,
          latitude: order.customer.latitude ?? null,
          longitude: order.customer.longitude ?? null,
          accuracyMeters: order.customer.latitude ? 12 : null,
          recordedById: driver1.id,
        },
      });

      const containers = containersOf(products, order.id, deliveredItems.map((d) => ({ product: d.item.product, quantityMilli: d.quantityMilli })));
      const containerIds = new Set([...containers.map((c) => c.productId), ...Object.keys(entry.returnedContainers).map((sku) => products.get(sku)?.id ?? "")]);
      for (const containerProductId of containerIds) {
        const line = containers.find((c) => c.productId === containerProductId);
        const sku = [...products.values()].find((p) => p.id === containerProductId)?.sku ?? "";
        await tx.containerMovement.create({
          data: { companyId, customerId: order.customer.id, containerProductId, orderId: order.id, routeId: route.id, delivered: line?.count ?? 0, returned: entry.returnedContainers[sku] ?? 0, createdAt: deliveredAt },
        });
      }

      await tx.auditLog.create({
        data: { companyId, userId: driver1.id, entity: "Order", entityId: order.id, action: "ENTREGA_FINALIZADA", before: { status: "EM_ROTA" }, after: { status: entry.outcome, deliveryProofId: proof.id }, createdAt: deliveredAt },
      });
    });
  }

  await db.auditLog.create({ data: { companyId, userId: expedicao.id, entity: "Order", entityId: o2.id, action: "PIX_CONFIRMADO", before: { paymentStatus: "PIX_A_CONFERIR" }, after: { paymentStatus: "RECEBIDO" }, createdAt: closedAt } });
  await db.auditLog.create({ data: { companyId, userId: expedicao.id, entity: "Route", entityId: route.id, action: "ACERTO_CONCLUIDO", before: { status: "AGUARDANDO_ACERTO" }, after: { status: "CONCLUIDA", cashHandedInCents: o1.amountToCollectCents }, createdAt: closedAt } });

  // --- Templates recorrentes ---
  const todayDow = dayOfWeekOfDateString(today);
  const dowAfter = (days: number): DayOfWeek => {
    const day = DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(todayDow) + days) % 7];
    if (!day) throw new Error("Dia da semana fora do intervalo.");
    return day;
  };
  const createTemplate = (params: { customer: CustomerRow; dayOfWeek: DayOfWeek; items: ReadonlyArray<readonly [sku: string, quantityMilli: number, unitPriceCents?: number]>; pausedUntil?: string; notes?: string }) =>
    db.recurringOrderTemplate.create({
      data: {
        companyId,
        customerId: params.customer.id,
        dayOfWeek: params.dayOfWeek,
        startsOn: dateStringToDbDate(addDays(today, -30)),
        pausedUntil: params.pausedUntil ? dateStringToDbDate(params.pausedUntil) : null,
        notes: params.notes ?? null,
        items: {
          create: params.items.map(([sku, quantityMilli, unitPriceCents]) => {
            const product = products.get(sku);
            if (!product) throw new Error(`Produto ${sku} não encontrado no seed.`);
            return { productId: product.id, quantity: milliToDecimalString(quantityMilli), unitPriceCents: unitPriceCents ?? null };
          }),
        },
      },
    });

  // Cai hoje e JÁ gerou o pedido de hoje (prova a idempotência do gerador).
  const templateGenerated = await createTemplate({ customer: customer(4), dayOfWeek: todayDow, items: [["LEITE-1L", 36_000], ["QJ-MUSS", 5_500]], notes: "Pedido fixo da semana" });
  // Cai hoje e ainda NÃO gerou (aparece no alerta do dashboard).
  await createTemplate({ customer: customer(11), dayOfWeek: todayDow, items: [["CERV-600-CX", 3_000], ["REFRI-2L-FD", 2_000]] });
  // Outros dias da semana.
  await createTemplate({ customer: customer(6), dayOfWeek: dowAfter(1), items: [["QJ-MUSS", 8_000], ["REFRI-2L-FD", 4_000]] });
  await createTemplate({ customer: customer(7), dayOfWeek: dowAfter(2), items: [["LEITE-1L", 24_000, 529], ["OVOS-DZ", 20_000]], notes: "Leite com preço combinado" });
  await createTemplate({ customer: customer(8), dayOfWeek: dowAfter(3), items: [["QJ-MUSS", 12_750]], pausedUntil: addDays(today, 10), notes: "Cliente em férias coletivas" });

  // --- 12 pedidos PENDENTE para hoje (pedidos nº 5 a 16) ---
  const todayOrders: Array<{ customer: number; items: ItemSpec[]; template?: string; notes?: string }> = [
    { customer: 0, items: [["LEITE-1L", 24_000], ["OVOS-DZ", 15_000], ["QJ-MUSS", 2_750]] },
    { customer: 1, items: [["CERV-600-CX", 4_000], ["REFRI-2L-FD", 2_000]] },
    { customer: 2, items: [["IOG-170", 48_000], ["LEITE-1L", 12_000]], notes: "Entregar pelos fundos" },
    { customer: 3, items: [["REFRI-2L-FD", 3_000], ["QJ-MUSS", 1_250]] },
    { customer: 4, items: [["LEITE-1L", 36_000], ["QJ-MUSS", 5_500]], template: templateGenerated.id },
    { customer: 5, items: [["IOG-170", 24_000], ["OVOS-DZ", 6_000]] },
    { customer: 6, items: [["QJ-MUSS", 7_500], ["REFRI-2L-FD", 5_000]] },
    { customer: 7, items: [["LEITE-1L", 30_000], ["OVOS-DZ", 20_000], ["IOG-170", 12_000]] },
    { customer: 8, items: [["QJ-MUSS", 10_250]] },
    { customer: 9, items: [["LEITE-1L", 60_000], ["IOG-170", 72_000]] },
    { customer: 10, items: [["CERV-600-CX", 10_000], ["REFRI-2L-FD", 12_000], ["LEITE-1L", 48_000]] },
    { customer: 2, items: [["OVOS-DZ", 8_000]], notes: "Pedido complementar feito por WhatsApp" },
  ];
  for (const spec of todayOrders) {
    await createOrder(db, companyId, products, { customer: customer(spec.customer), deliveryDate: today, items: spec.items, recurringTemplateId: spec.template, notes: spec.notes });
  }

  return { companyId, admin, counts: { customers: customers.length, products: products.size, todayOrders: todayOrders.length } };
}

// ---------------------------------------------------------------------------
// Segunda empresa (existe para os testes de isolamento)
// ---------------------------------------------------------------------------

async function seedSecondCompany(today: string, passwordHash: string) {
  const company = await createCompany({ name: "Distribuidora Vizinha", cnpj: demoCnpj(500), phone: "551634440000" });
  const companyId = company.id;
  const db = getTenantDb({ companyId });

  await db.user.create({ data: { companyId, name: "Vera Vizinha", email: "admin@vizinha.test", phone: "5516977770001", role: "ADMIN", passwordHash } });
  await db.user.create({ data: { companyId, name: "Valdir Motorista", email: "motorista@vizinha.test", phone: "5516977770002", role: "MOTORISTA", passwordHash } });
  await db.vehicle.create({ data: { companyId, plate: "VZN7C89", model: "VW Delivery", capacityKg: 3000 } });

  // Mesmos SKUs da outra empresa, de propósito: a unicidade é por empresa.
  const products = await createProducts(db, companyId, [
    { sku: "CAIXA-PLAST", name: "Caixa plástica (Vizinha)", unit: "UN", priceCents: 2000, weightGrams: 1700, isReturnableContainer: true },
    { sku: "LEITE-1L", name: "Leite desnatado 1L", unit: "UN", priceCents: 599, weightGrams: 1040, containerSku: "CAIXA-PLAST", unitsPerContainer: 12 },
    { sku: "MANT-200", name: "Manteiga 200g", unit: "UN", priceCents: 1290, weightGrams: 210 },
  ]);
  const customers = await createCustomers(
    db,
    companyId,
    [
      { name: "Mercado Vizinho Um", street: "Rua Amador Bueno", number: "50", neighborhood: "Centro", city: "Ribeirão Preto", zipCode: "14010070", paymentMethod: "DINHEIRO" },
      { name: "Mercado Vizinho Dois", street: "Rua Lafaiete", number: "900", neighborhood: "Centro", city: "Ribeirão Preto", zipCode: "14015080", paymentMethod: "BOLETO" },
    ],
    600,
  );
  for (const row of customers) {
    await createOrder(db, companyId, products, { customer: row, deliveryDate: today, items: [["LEITE-1L", 12_000], ["MANT-200", 6_000]] });
  }
  return { companyId };
}

// ---------------------------------------------------------------------------

async function main() {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("O seed de demonstração não roda em produção (VERCEL_ENV=production).");
  }
  if ((await prisma.company.count()) > 0) {
    throw new Error("O banco já tem dados. No ambiente local, use `pnpm db:reset` para recriar tudo do zero.");
  }

  const today = todayInTimeZone(TIMEZONE);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const main = await seedMainCompany(today, passwordHash);
  await seedSecondCompany(today, passwordHash);

  console.log(
    [
      "",
      `Seed concluído. "Hoje" = ${today} (${TIMEZONE}).`,
      `Distribuidora Exemplo: ${main.counts.customers} clientes, ${main.counts.products} produtos, ${main.counts.todayOrders} pedidos pendentes para hoje, 1 rota de ontem concluída.`,
      "",
      "Credenciais de demonstração (senha igual para todos):",
      `  Senha ............ ${DEMO_PASSWORD}`,
      "  Distribuidora Exemplo",
      "    ADMIN .......... admin@exemplo.test",
      "    EXPEDICAO ...... expedicao@exemplo.test",
      "    MOTORISTA ...... motorista1@exemplo.test",
      "    MOTORISTA ...... motorista2@exemplo.test",
      "  Distribuidora Vizinha (isolamento entre empresas)",
      "    ADMIN .......... admin@vizinha.test",
      "    MOTORISTA ...... motorista@vizinha.test",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? `\nFalha no seed: ${error.message}` : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
