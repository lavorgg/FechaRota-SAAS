import { ScrollTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/lista/empty-state";
import { Pagination } from "@/components/lista/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { listAuditLogs } from "@/lib/services/audit";
import { listAuditSchema } from "@/lib/validation/audit";

export const metadata: Metadata = { title: "Auditoria" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function AuditPage({ searchParams }: PageProps<"/app/auditoria">) {
  const session = await requirePagePermission("auditoria.consultar");
  const params = await searchParams;
  const filters = listAuditSchema.parse({ de: first(params.de), ate: first(params.ate), tipo: first(params.tipo), pagina: first(params.pagina) });
  const result = await listAuditLogs(serviceContext(session), filters);
  const hasFilters = Boolean(filters.de || filters.ate || filters.tipo);
  const hrefFor = (pagina: number) => {
    const query = new URLSearchParams();
    if (filters.de) query.set("de", filters.de);
    if (filters.ate) query.set("ate", filters.ate);
    if (filters.tipo) query.set("tipo", filters.tipo);
    if (pagina > 1) query.set("pagina", String(pagina));
    const text = query.toString();
    return text ? `/app/auditoria?${text}` : "/app/auditoria";
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-muted-foreground">
          Quem fez o quê e quando: liberações, entregas, Pix, acertos, cancelamentos e mudanças de usuários. {result.total} {result.total === 1 ? "registro" : "registros"}.
        </p>
      </div>

      <form action="/app/auditoria" method="get" className="flex flex-wrap items-end gap-2" aria-label="Filtros">
        <label className="flex flex-col gap-1 text-sm">
          De
          <Input type="date" name="de" defaultValue={filters.de ?? ""} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Até
          <Input type="date" name="ate" defaultValue={filters.ate ?? ""} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Evento
          <select name="tipo" defaultValue={filters.tipo ?? ""} className={selectClass}>
            <option value="">Todos os eventos</option>
            {result.actions.map((action) => (
              <option key={action.value} value={action.value}>
                {action.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {hasFilters && (
          <Button asChild variant="ghost">
            <Link href="/app/auditoria">Limpar filtros</Link>
          </Button>
        )}
      </form>

      {result.items.length === 0 ? (
        <EmptyState icon={<ScrollTextIcon className="size-6" aria-hidden />} title={hasFilters ? "Nenhum registro com estes filtros." : "Nenhum registro ainda."} description={hasFilters ? "Mude o período ou o evento." : undefined} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((entry) => (
                <TableRow key={entry.id} className="align-top">
                  <TableCell className="whitespace-nowrap tabular-nums">{entry.createdAt}</TableCell>
                  <TableCell>{entry.userName}</TableCell>
                  <TableCell className="font-medium">{entry.actionLabel}</TableCell>
                  <TableCell>{entry.subject}</TableCell>
                  <TableCell className="text-sm">
                    {entry.reason && <p>Motivo: {entry.reason}</p>}
                    {entry.changes.length > 0 && (
                      <ul className="text-muted-foreground">
                        {entry.changes.map((change) => (
                          <li key={change.field}>
                            {change.field}: {change.before} → {change.after}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={hrefFor} />
    </>
  );
}
