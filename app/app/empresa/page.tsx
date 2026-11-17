import type { Metadata } from "next";

import { CompanySettingsForm } from "@/components/empresa/company-settings-form";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";
import { getCompanySettings } from "@/lib/services/company";

export const metadata: Metadata = { title: "Empresa" };

export default async function CompanyPage() {
  const session = await requirePagePermission("usuarios.gerenciar");
  const company = await getCompanySettings(serviceContext(session));
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
        <p className="text-muted-foreground">Dados que aparecem nos romaneios e o endereço de partida das rotas.</p>
      </div>
      <CompanySettingsForm company={company} readOnly={!planAllowsWrite(session.company.planStatus)} />
    </>
  );
}
