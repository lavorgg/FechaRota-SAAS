"use client";

import { importCustomersAction } from "@/app/app/clientes/actions";
import { CUSTOMER_IMPORT_COLUMNS, CUSTOMER_IMPORT_REQUIRED, CUSTOMER_IMPORT_TEMPLATE, customerImportRowSchema } from "@/lib/validation/import";

import { CsvImport } from "./csv-import";

export function CustomerImport() {
  return (
    <CsvImport
      kind="clientes"
      columns={CUSTOMER_IMPORT_COLUMNS}
      required={CUSTOMER_IMPORT_REQUIRED}
      template={CUSTOMER_IMPORT_TEMPLATE}
      schema={customerImportRowSchema}
      previewColumns={["nome", "documento", "bairro", "cidade", "forma_pagamento"]}
      upload={importCustomersAction}
      backHref="/app/clientes"
    />
  );
}
