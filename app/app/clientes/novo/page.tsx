import type { Metadata } from "next";

import { CustomerForm } from "@/components/clientes/customer-form";
import { requirePagePermission } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewCustomerPage() {
  const session = await requirePagePermission("cadastros.gerenciar");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Novo cliente</h1>
      <CustomerForm customer={null} readOnly={!planAllowsWrite(session.company.planStatus)} />
    </>
  );
}
