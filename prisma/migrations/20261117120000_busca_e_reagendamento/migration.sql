-- Busca sem diferenciar maiúsculas nem acentos (seção 5.5): texto normalizado mantido pelo app
-- em domain/search.ts. O preenchimento abaixo reproduz a mesma normalização para o português.
ALTER TABLE "Customer" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

UPDATE "Customer" SET "searchText" = btrim(regexp_replace(lower(translate(
  concat_ws(' ', "name", "legalName", "neighborhood", "city", "document", "phone"),
  'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
)), '[^a-z0-9]+', ' ', 'g'));

UPDATE "Product" SET "searchText" = btrim(regexp_replace(lower(translate(
  concat_ws(' ', "sku", "name"),
  'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
)), '[^a-z0-9]+', ' ', 'g'));

-- Reagendar cria UM pedido novo ligado ao original (decisão do dono do produto): o banco
-- impede um segundo reagendamento do mesmo pedido, mesmo com dois cliques simultâneos.
CREATE UNIQUE INDEX "Order_companyId_rescheduledFromOrderId_key" ON "Order"("companyId", "rescheduledFromOrderId");

-- Um CPF/CNPJ por empresa (cadastro manual e importação recusam duplicado).
CREATE UNIQUE INDEX "Customer_companyId_document_key" ON "Customer"("companyId", "document");
