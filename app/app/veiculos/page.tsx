import type { Metadata } from "next";

import { VehiclesManager } from "@/components/veiculos/vehicles-manager";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";
import { parseListQuery } from "@/lib/list-params";
import { listVehicles } from "@/lib/services/vehicles";

export const metadata: Metadata = { title: "Veículos" };

export default async function VehiclesPage({ searchParams }: PageProps<"/app/veiculos">) {
  const session = await requirePagePermission("cadastros.gerenciar");
  const query = parseListQuery(await searchParams);
  const result = await listVehicles(serviceContext(session), query);
  return <VehiclesManager result={result} query={query.q ?? ""} status={query.status} readOnly={!planAllowsWrite(session.company.planStatus)} />;
}
