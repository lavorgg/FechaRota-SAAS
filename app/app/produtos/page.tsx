import type { Metadata } from "next";

import { ProductsManager } from "@/components/produtos/products-manager";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";
import { parseListQuery } from "@/lib/list-params";
import { listContainerOptions, listProducts } from "@/lib/services/products";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProductsPage({ searchParams }: PageProps<"/app/produtos">) {
  const session = await requirePagePermission("cadastros.gerenciar");
  const ctx = serviceContext(session);
  const query = parseListQuery(await searchParams);
  const [result, containers] = await Promise.all([listProducts(ctx, query), listContainerOptions(ctx)]);
  return (
    <ProductsManager result={result} containers={containers} query={query.q ?? ""} status={query.status} readOnly={!planAllowsWrite(session.company.planStatus)} />
  );
}
