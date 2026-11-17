import type { Metadata } from "next";

import { CustomersList } from "@/components/clientes/customers-list";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";
import { parseListQuery } from "@/lib/list-params";
import { listCustomers } from "@/lib/services/customers";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: PageProps<"/app/clientes">) {
  const session = await requirePagePermission("cadastros.gerenciar");
  const query = parseListQuery(await searchParams);
  const result = await listCustomers(serviceContext(session), query);
  return <CustomersList result={result} query={query.q ?? ""} status={query.status} readOnly={!planAllowsWrite(session.company.planStatus)} />;
}
