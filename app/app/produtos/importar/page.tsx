import type { Metadata } from "next";

import { ProductImport } from "@/components/importacao/product-import";
import { requirePagePermission } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Importar produtos" };

export default async function ImportProductsPage() {
  await requirePagePermission("cadastros.gerenciar");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Importar produtos</h1>
        <p className="text-muted-foreground">Cadastre muitos produtos de uma vez a partir de uma planilha.</p>
      </div>
      <ProductImport />
    </>
  );
}
