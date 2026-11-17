import type { Metadata } from "next";

import { RouteEditor } from "@/components/rotas/route-editor";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { planAllowsWrite } from "@/lib/auth/plan";
import { orNotFound } from "@/lib/page-helpers";
import { getRouteDetail } from "@/lib/services/routes";

export const metadata: Metadata = { title: "Rota" };

export default async function RoutePage({ params }: PageProps<"/app/rotas/[id]">) {
  const session = await requirePagePermission("rotas.montar");
  const { id } = await params;
  const route = await orNotFound(getRouteDetail(serviceContext(session), id));
  return (
    <RouteEditor
      key={route.version}
      route={route}
      canReopen={can(session.user.role, "rotas.reabrir")}
      canEditCompany={can(session.user.role, "usuarios.gerenciar")}
      readOnly={!planAllowsWrite(session.company.planStatus)}
    />
  );
}
