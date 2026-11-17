"use client";

import { MoreHorizontalIcon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setUserActiveAction } from "@/app/app/usuarios/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhoneBR } from "@/domain/normalize";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserDTO } from "@/lib/services/users";

import { ResetPasswordDialog } from "./reset-password-dialog";
import { UserFormDialog } from "./user-form-dialog";

type Props = {
  users: UserDTO[];
  total: number;
  page: number;
  pageCount: number;
  query: string;
  currentUserId: string;
  readOnly: boolean;
};

function pageHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("pagina", String(page));
  const text = params.toString();
  return text ? `/app/usuarios?${text}` : "/app/usuarios";
}

export function UsersManager({ users, total, page, pageCount, query, currentUserId, readOnly }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserDTO | null>(null);
  const [resetting, setResetting] = useState<UserDTO | null>(null);
  const [deactivating, setDeactivating] = useState<UserDTO | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function setActive(user: UserDTO, active: boolean) {
    startTransition(async () => {
      const result = await setUserActiveAction({ id: user.id, active });
      if (result.ok) toast.success(active ? `${user.name} reativado.` : `${user.name} desativado.`);
      else toast.error(result.error);
      setDeactivating(null);
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground">
            {total} {total === 1 ? "usuário" : "usuários"}
          </p>
        </div>
        <Button onClick={openCreate} disabled={readOnly}>
          <PlusIcon aria-hidden />
          Novo usuário
        </Button>
      </div>

      <form action="/app/usuarios" method="get" role="search" className="flex max-w-md gap-2">
        <Input name="q" defaultValue={query} placeholder="Buscar por nome ou e-mail" aria-label="Buscar usuários" />
        <Button type="submit" variant="outline">
          <SearchIcon aria-hidden />
          Buscar
        </Button>
      </form>

      {users.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <UsersIcon className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">{query ? `Nenhum usuário encontrado para "${query}".` : "Nenhum usuário cadastrado."}</p>
          {query ? (
            <Button asChild variant="outline">
              <Link href="/app/usuarios">Limpar busca</Link>
            </Button>
          ) : (
            <Button onClick={openCreate} disabled={readOnly}>
              Cadastrar o primeiro usuário
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <TableRow key={user.id} data-inactive={!user.active || undefined} className="data-inactive:text-muted-foreground">
                    <TableCell className="font-medium">
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="hidden md:table-cell">{user.phone ? formatPhoneBR(user.phone) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{ROLE_LABELS[user.role]}</Badge>
                    </TableCell>
                    <TableCell>{user.active ? "Ativo" : "Desativado"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Ações para ${user.name}`} disabled={readOnly || pending}>
                            <MoreHorizontalIcon aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(user);
                              setFormOpen(true);
                            }}
                          >
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setResetting(user)}>Redefinir senha</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.active ? (
                            <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => setDeactivating(user)}>
                              Desativar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setActive(user, true)}>Reativar</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Paginação" className="flex items-center gap-3">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(query, page - 1)}>Anterior</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Anterior
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Página {page} de {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(query, page + 1)}>Próxima</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Próxima
            </Button>
          )}
        </nav>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} isSelf={editing?.id === currentUserId} />
      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />
      <AlertDialog open={deactivating !== null} onOpenChange={(open) => !open && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {deactivating?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa perde o acesso na hora, em todos os aparelhos. O histórico de pedidos e entregas continua. Dá para reativar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                if (deactivating) setActive(deactivating, false);
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
