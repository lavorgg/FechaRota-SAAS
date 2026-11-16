-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "ProofPolicy" AS ENUM ('SIGNATURE_REQUIRED', 'PHOTO_OR_SIGNATURE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EXPEDICAO', 'MOTORISTA');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'DINHEIRO', 'BOLETO', 'FATURADO');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('CX', 'DZ', 'FD', 'KG', 'UN', 'PCT');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDENTE', 'EM_ROTA', 'ENTREGUE', 'ENTREGUE_PARCIAL', 'NAO_ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('A_RECEBER', 'RECEBIDO', 'PIX_A_CONFERIR', 'FATURADO', 'NAO_RECEBIDO');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('RASCUNHO', 'LIBERADA_CARGA', 'EM_ANDAMENTO', 'AGUARDANDO_ACERTO', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "DeliveryOutcome" AS ENUM ('ENTREGUE', 'ENTREGUE_PARCIAL', 'NAO_ENTREGUE');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('ESTABELECIMENTO_FECHADO', 'PEDIDO_RECUSADO', 'ENDERECO_NAO_LOCALIZADO', 'CLIENTE_SEM_DINHEIRO', 'AVARIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('PHOTO', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "planStatus" "PlanStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "proofPolicy" "ProofPolicy" NOT NULL DEFAULT 'PHOTO_OR_SIGNATURE',
    "fileRetentionMonths" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCounter" (
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompanyCounter_pkey" PRIMARY KEY ("companyId","key")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacityKg" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "document" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "zipCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "referencePoint" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "neighborhoodKey" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL,
    "defaultPaymentMethod" "PaymentMethod" NOT NULL,
    "deliveryWindow" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "weightKg" DECIMAL(10,3),
    "isReturnableContainer" BOOLEAN NOT NULL DEFAULT false,
    "containerProductId" TEXT,
    "unitsPerContainer" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringOrderTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsOn" DATE NOT NULL,
    "pausedUntil" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringOrderTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringOrderTemplateItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitPriceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringOrderTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "recurringTemplateId" TEXT,
    "routeId" TEXT,
    "stopSequence" INTEGER,
    "deliveryDate" DATE NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDENTE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deliveryZipCode" TEXT NOT NULL,
    "deliveryStreet" TEXT NOT NULL,
    "deliveryNumber" TEXT NOT NULL,
    "deliveryComplement" TEXT,
    "deliveryNeighborhood" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "deliveryState" CHAR(2) NOT NULL,
    "deliveryReferencePoint" TEXT,
    "deliveryNeighborhoodKey" TEXT NOT NULL,
    "deliveryCityKey" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "amountToCollectCents" INTEGER NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "notes" TEXT,
    "cancelReason" TEXT,
    "rescheduledFromOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "deliveredQuantity" DECIMAL(10,3),
    "returnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "status" "RouteStatus" NOT NULL DEFAULT 'RASCUNHO',
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "cashHandedInCents" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "outcome" "DeliveryOutcome" NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiverName" TEXT,
    "receiverDocument" TEXT,
    "signatureFileKey" TEXT,
    "photoFileKeys" TEXT[],
    "failureReason" "FailureReason",
    "failureNote" TEXT,
    "cashCollectedCents" INTEGER NOT NULL DEFAULT 0,
    "pixCollectedCents" INTEGER NOT NULL DEFAULT 0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMeters" DOUBLE PRECISION,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "containerProductId" TEXT NOT NULL,
    "orderId" TEXT,
    "routeId" TEXT,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "key" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_role_active_idx" ON "User"("companyId", "role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_id_key" ON "User"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_companyId_id_key" ON "Vehicle"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_companyId_plate_key" ON "Vehicle"("companyId", "plate");

-- CreateIndex
CREATE INDEX "Customer_companyId_cityKey_neighborhoodKey_idx" ON "Customer"("companyId", "cityKey", "neighborhoodKey");

-- CreateIndex
CREATE INDEX "Customer_companyId_active_name_idx" ON "Customer"("companyId", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_id_key" ON "Customer"("companyId", "id");

-- CreateIndex
CREATE INDEX "Product_companyId_active_name_idx" ON "Product"("companyId", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_id_key" ON "Product"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");

-- CreateIndex
CREATE INDEX "RecurringOrderTemplate_companyId_dayOfWeek_active_idx" ON "RecurringOrderTemplate"("companyId", "dayOfWeek", "active");

-- CreateIndex
CREATE INDEX "RecurringOrderTemplate_companyId_customerId_idx" ON "RecurringOrderTemplate"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOrderTemplate_companyId_id_key" ON "RecurringOrderTemplate"("companyId", "id");

-- CreateIndex
CREATE INDEX "RecurringOrderTemplateItem_companyId_templateId_idx" ON "RecurringOrderTemplateItem"("companyId", "templateId");

-- CreateIndex
CREATE INDEX "RecurringOrderTemplateItem_companyId_productId_idx" ON "RecurringOrderTemplateItem"("companyId", "productId");

-- CreateIndex
CREATE INDEX "Order_companyId_deliveryDate_status_idx" ON "Order"("companyId", "deliveryDate", "status");

-- CreateIndex
CREATE INDEX "Order_companyId_routeId_stopSequence_idx" ON "Order"("companyId", "routeId", "stopSequence");

-- CreateIndex
CREATE INDEX "Order_companyId_customerId_deliveryDate_idx" ON "Order"("companyId", "customerId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_companyId_deliveryCityKey_deliveryNeighborhoodKey_idx" ON "Order"("companyId", "deliveryCityKey", "deliveryNeighborhoodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_companyId_id_key" ON "Order"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_companyId_orderNumber_key" ON "Order"("companyId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_recurringTemplateId_deliveryDate_key" ON "Order"("recurringTemplateId", "deliveryDate");

-- CreateIndex
CREATE INDEX "OrderItem_companyId_orderId_idx" ON "OrderItem"("companyId", "orderId");

-- CreateIndex
CREATE INDEX "OrderItem_companyId_productId_idx" ON "OrderItem"("companyId", "productId");

-- CreateIndex
CREATE INDEX "Route_companyId_deliveryDate_status_idx" ON "Route"("companyId", "deliveryDate", "status");

-- CreateIndex
CREATE INDEX "Route_companyId_driverId_deliveryDate_idx" ON "Route"("companyId", "driverId", "deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Route_companyId_id_key" ON "Route"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Route_companyId_code_key" ON "Route"("companyId", "code");

-- CreateIndex
CREATE INDEX "DeliveryProof_companyId_deliveredAt_idx" ON "DeliveryProof"("companyId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProof_companyId_orderId_key" ON "DeliveryProof"("companyId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProof_companyId_clientRequestId_key" ON "DeliveryProof"("companyId", "clientRequestId");

-- CreateIndex
CREATE INDEX "ContainerMovement_companyId_customerId_containerProductId_idx" ON "ContainerMovement"("companyId", "customerId", "containerProductId");

-- CreateIndex
CREATE INDEX "ContainerMovement_companyId_routeId_idx" ON "ContainerMovement"("companyId", "routeId");

-- CreateIndex
CREATE INDEX "ContainerMovement_companyId_orderId_idx" ON "ContainerMovement"("companyId", "orderId");

-- CreateIndex
CREATE INDEX "FileObject_companyId_status_createdAt_idx" ON "FileObject"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entity_entityId_idx" ON "AuditLog"("companyId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCounter" ADD CONSTRAINT "CompanyCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_containerProductId_fkey" FOREIGN KEY ("companyId", "containerProductId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrderTemplate" ADD CONSTRAINT "RecurringOrderTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrderTemplate" ADD CONSTRAINT "RecurringOrderTemplate_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrderTemplateItem" ADD CONSTRAINT "RecurringOrderTemplateItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrderTemplateItem" ADD CONSTRAINT "RecurringOrderTemplateItem_companyId_templateId_fkey" FOREIGN KEY ("companyId", "templateId") REFERENCES "RecurringOrderTemplate"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrderTemplateItem" ADD CONSTRAINT "RecurringOrderTemplateItem_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_recurringTemplateId_fkey" FOREIGN KEY ("companyId", "recurringTemplateId") REFERENCES "RecurringOrderTemplate"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_routeId_fkey" FOREIGN KEY ("companyId", "routeId") REFERENCES "Route"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_rescheduledFromOrderId_fkey" FOREIGN KEY ("companyId", "rescheduledFromOrderId") REFERENCES "Order"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_companyId_orderId_fkey" FOREIGN KEY ("companyId", "orderId") REFERENCES "Order"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_companyId_driverId_fkey" FOREIGN KEY ("companyId", "driverId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_companyId_closedById_fkey" FOREIGN KEY ("companyId", "closedById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_companyId_vehicleId_fkey" FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_companyId_orderId_fkey" FOREIGN KEY ("companyId", "orderId") REFERENCES "Order"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_companyId_recordedById_fkey" FOREIGN KEY ("companyId", "recordedById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerMovement" ADD CONSTRAINT "ContainerMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerMovement" ADD CONSTRAINT "ContainerMovement_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerMovement" ADD CONSTRAINT "ContainerMovement_companyId_containerProductId_fkey" FOREIGN KEY ("companyId", "containerProductId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerMovement" ADD CONSTRAINT "ContainerMovement_companyId_orderId_fkey" FOREIGN KEY ("companyId", "orderId") REFERENCES "Order"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerMovement" ADD CONSTRAINT "ContainerMovement_companyId_routeId_fkey" FOREIGN KEY ("companyId", "routeId") REFERENCES "Route"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_companyId_uploadedById_fkey" FOREIGN KEY ("companyId", "uploadedById") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Regras escritas à mão (o schema.prisma não consegue expressá-las).
-- ---------------------------------------------------------------------------

-- Seção 3.8: um motorista não pode ter duas rotas EM_ANDAMENTO ao mesmo tempo.
CREATE UNIQUE INDEX "Route_one_in_progress_per_driver" ON "Route"("companyId", "driverId") WHERE "status" = 'EM_ANDAMENTO';

-- Seção 3.1: nenhum valor em centavos pode ser negativo.
ALTER TABLE "Product" ADD CONSTRAINT "Product_priceCents_check" CHECK ("priceCents" >= 0);
ALTER TABLE "RecurringOrderTemplateItem" ADD CONSTRAINT "RecurringOrderTemplateItem_unitPriceCents_check" CHECK ("unitPriceCents" IS NULL OR "unitPriceCents" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_money_check" CHECK ("totalCents" >= 0 AND "amountToCollectCents" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_money_check" CHECK ("unitPriceCents" >= 0 AND "subtotalCents" >= 0);
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_money_check" CHECK ("cashCollectedCents" >= 0 AND "pixCollectedCents" >= 0);
ALTER TABLE "Route" ADD CONSTRAINT "Route_cashHandedInCents_check" CHECK ("cashHandedInCents" IS NULL OR "cashHandedInCents" >= 0);

-- Quantidades e contagens de vasilhame também não podem ser negativas.
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" > 0 AND ("deliveredQuantity" IS NULL OR ("deliveredQuantity" >= 0 AND "deliveredQuantity" <= "quantity")));
ALTER TABLE "RecurringOrderTemplateItem" ADD CONSTRAINT "RecurringOrderTemplateItem_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "ContainerMovement" ADD CONSTRAINT "ContainerMovement_counts_check" CHECK ("delivered" >= 0 AND "returned" >= 0);

-- Seção 3.4: toda chave de arquivo começa com o prefixo da própria empresa.
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_key_prefix_check" CHECK ("key" LIKE 'companies/' || "companyId" || '/%');
