"use client";

import { importProductsAction } from "@/app/app/produtos/actions";
import { normalizeSearchText } from "@/domain/search";
import { PRODUCT_IMPORT_COLUMNS, PRODUCT_IMPORT_REQUIRED, PRODUCT_IMPORT_TEMPLATE, productImportRowSchema } from "@/lib/validation/import";

import { CsvImport } from "./csv-import";

const isReturnable = (value: string | undefined) => ["sim", "s", "x", "1", "true", "verdadeiro"].includes(normalizeSearchText(value ?? ""));

export function ProductImport() {
  return (
    <CsvImport
      kind="produtos"
      columns={PRODUCT_IMPORT_COLUMNS}
      required={PRODUCT_IMPORT_REQUIRED}
      template={PRODUCT_IMPORT_TEMPLATE}
      schema={productImportRowSchema}
      previewColumns={["sku", "nome", "unidade", "preco", "sku_vasilhame"]}
      // Vasilhames primeiro: os produtos que saem neles podem estar em lotes seguintes.
      sortForUpload={(rows) => [...rows.filter((r) => isReturnable(r.values.retornavel)), ...rows.filter((r) => !isReturnable(r.values.retornavel))]}
      upload={importProductsAction}
      backHref="/app/produtos"
    />
  );
}
