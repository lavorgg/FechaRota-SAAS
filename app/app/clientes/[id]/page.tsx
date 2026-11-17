import type { Metadata } from "next";

import { CustomerForm } from "@/components/clientes/customer-form";
import { CustomerTemplates } from "@/components/clientes/customer-templates";
import { Badge } from "@/components/ui/badge";
import { todayInTimeZone } from "@/domain/dates";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";
import { orNotFound } from "@/lib/page-helpers";
import { getCustomer } from "@/lib/services/customers";
import { listOrderProducts } from "@/lib/services/orders";
import { listCustomerTemplates } from "@/lib/services/templates";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: PageProps<"/app/clientes/[id]">) {
  const session = await requirePagePermission("cadastros.gerenciar");
  const ctx = serviceContext(session);
  const { id } = await params;
  const customer = await orNotFound(getCustomer(ctx, id));
  const [templates, catalog] = await Promise.all([listCustomerTemplates(ctx, id), listOrderProducts(ctx)]);
  const readOnly = !planAllowsWrite(session.company.planStatus);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        {!customer.active && <Badge variant="outline">Inativo</Badge>}
      </div>
      <CustomerForm customer={customer} readOnly={readOnly} />
      <CustomerTemplates customerId={customer.id} templates={templates} catalog={catalog} today={todayInTimeZone(session.company.timezone)} readOnly={readOnly} />
    </>
  );
}
