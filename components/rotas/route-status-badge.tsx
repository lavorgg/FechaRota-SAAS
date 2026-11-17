import { Badge } from "@/components/ui/badge";
import { ROUTE_STATUS_LABELS, type RouteStatus } from "@/domain/route-status";

const VARIANT: Record<RouteStatus, "default" | "secondary" | "outline"> = {
  RASCUNHO: "outline",
  LIBERADA_CARGA: "default",
  EM_ANDAMENTO: "default",
  AGUARDANDO_ACERTO: "secondary",
  CONCLUIDA: "secondary",
};

export function RouteStatusBadge({ status }: { status: RouteStatus }) {
  return <Badge variant={VARIANT[status]}>{ROUTE_STATUS_LABELS[status]}</Badge>;
}
