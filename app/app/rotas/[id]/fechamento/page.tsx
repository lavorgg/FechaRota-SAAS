import type { Metadata } from "next";
import Link from "next/link";

import { SettlementView } from "@/components/fechamento/settlement-view";
import { Button } from "@/components/ui/button";
import { addDays, todayInTimeZone } from "@/domain/dates";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { planAllowsWrite } from "@/lib/auth/plan";
import { ServiceError } from "@/lib/errors";
import { orNotFound } from "@/lib/page-helpers";
import { SETTLEMENT_MESSAGES, getSettlement } from "@/lib/services/settlement";

export const metadata: Metadata = { title: "Fechamento" };

export default async function SettlementPage({ params }: PageProps<"/app/rotas/[id]/fechamento">) {
  const session = await requirePagePermission("acerto.realizar");
  const { id } = await params;
  const data = await orNotFound(
    getSettlement(serviceContext(session), id).catch((error: unknown) => {
      if (error instanceof ServiceError && error.message === SETTLEMENT_MESSAGES.notOpen) return null;
      throw error;
    }),
  );
  if (!data) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <p className="font-medium">{SETTLEMENT_MESSAGES.notOpen}</p>
        <Button asChild variant="outline">
          <Link href={`/app/rotas/${id}`}>Voltar para a rota</Link>
        </Button>
      </div>
    );
  }
  const today = todayInTimeZone(session.company.timezone);
  return (
    <SettlementView
      key={`${data.route.version}-${data.stops.map((stop) => `${stop.paymentStatus}${stop.proof?.cashCents ?? ""}${stop.proof?.pixCents ?? ""}${stop.rescheduledToNumber ?? ""}`).join(",")}`}
      data={data}
      canCorrect={can(session.user.role, "entregas.corrigir")}
      readOnly={!planAllowsWrite(session.company.planStatus)}
      today={today}
      tomorrow={addDays(today, 1)}
    />
  );
}
