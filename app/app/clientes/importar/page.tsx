import type { Metadata } from "next";

import { CustomerImport } from "@/components/importacao/customer-import";
import { requirePagePermission } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Importar clientes" };

export default async function ImportCustomersPage() {
  await requirePagePermission("cadastros.gerenciar");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Importar clientes</h1>
        <p className="text-muted-foreground">Cadastre muitos clientes de uma vez a partir de uma planilha.</p>
      </div>
      <CustomerImport />
    </>
  );
}
