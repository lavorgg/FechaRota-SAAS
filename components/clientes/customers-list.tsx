"use client";

import { MoreHorizontalIcon, PlusIcon, UploadIcon, UsersRoundIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteCustomerAction, setCustomerActiveAction } from "@/app/app/clientes/actions";
import { ConfirmDialog } from "@/components/lista/confirm-dialog";
import { EmptyState } from "@/components/lista/empty-state";
import { ListToolbar } from "@/components/lista/list-toolbar";
import { Pagination, listHref } from "@/components/lista/pagination";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhoneBR } from "@/domain/normalize";
import { PAYMENT_METHOD_LABELS } from "@/domain/payment";
import type { Page } from "@/lib/services/common";
import type { CustomerListItemDTO } from "@/lib/services/customers";

type Props = { result: Page<CustomerListItemDTO>; query: string; status: string; readOnly: boolean };

export function CustomersList({ result, query, status, readOnly }: Props) {
  const [deleting, setDeleting] = useState<CustomerListItemDTO | null>(null);
  const [pending, startTransition] = useTransition();

  function setActive(customer: CustomerListItemDTO, active: boolean) {
    startTransition(async () => {
      const r = await setCustomerActiveAction({ id: customer.id, active });
      if (r.ok) toast.success(active ? "Cliente reativado." : "Cliente inativado.");
      else toast.error(r.error);
    });
  }

  function remove(customer: CustomerListItemDTO) {
    startTransition(async () => {
      const r = await deleteCustomerAction({ id: customer.id });
      if (r.ok) toast.success("Cliente excluído.");
      else toast.error(r.error);
      setDeleting(null);
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            {result.total} {result.total === 1 ? "cliente" : "clientes"}
          </p>
        </div>
        {readOnly ? (
          <Button disabled>
            <PlusIcon aria-hidden />
            Novo cliente
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/app/clientes/importar">
                <UploadIcon aria-hidden />
                Importar CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/app/clientes/novo">
                <PlusIcon aria-hidden />
                Novo cliente
              </Link>
            </Button>
          </div>
        )}
      </div>
      <ListToolbar action="/app/clientes" query={query} status={status} placeholder="Buscar por nome, bairro, telefone ou CPF/CNPJ" />

      {result.items.length === 0 ? (
        <EmptyState
          icon={<UsersRoundIcon className="size-6" aria-hidden />}
          title={query ? `Nenhum cliente encontrado para "${query}".` : "Nenhum cliente nesta lista."}
          description="Cadastre um a um ou importe uma planilha."
          action={
            !readOnly && (
              <Button asChild>
                <Link href="/app/clientes/novo">Cadastrar cliente</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Bairro</TableHead>
                <TableHead className="hidden lg:table-cell">Telefone</TableHead>
                <TableHead className="hidden md:table-cell">Pagamento</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((customer) => (
                <TableRow key={customer.id} className={customer.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-medium">
                    <Link href={`/app/clientes/${customer.id}`} className="hover:underline">
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {customer.neighborhood} · {customer.city}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{customer.phone ? formatPhoneBR(customer.phone) : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{PAYMENT_METHOD_LABELS[customer.defaultPaymentMethod]}</TableCell>
                  <TableCell>{customer.active ? "Ativo" : "Inativo"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações para ${customer.name}`} disabled={pending}>
                          <MoreHorizontalIcon aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/clientes/${customer.id}`}>Abrir</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={readOnly} onSelect={() => setActive(customer, !customer.active)}>
                          {customer.active ? "Inativar" : "Reativar"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" disabled={readOnly} onSelect={() => setDeleting(customer)}>
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(pagina) => listHref("/app/clientes", { q: query, situacao: status, pagina })} />
      <ConfirmDialog
        open={deleting !== null}
        title={`Excluir ${deleting?.name ?? ""}?`}
        description="Só dá para excluir cliente sem pedidos nem pedidos recorrentes. Se já tiver, inative: ele some do lançamento e o histórico continua."
        confirmLabel="Excluir"
        pending={pending}
        onConfirm={() => deleting && remove(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  );
}
