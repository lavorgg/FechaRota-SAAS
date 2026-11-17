"use client";

import { ChevronDownIcon, CircleUserRoundIcon, LogOutIcon } from "lucide-react";
import { useTransition } from "react";

import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ name, roleLabel, email }: { name: string; roleLabel: string; email: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-56 gap-2" aria-label={name}>
          <CircleUserRoundIcon className="sm:hidden" aria-hidden />
          <span className="hidden truncate sm:inline">{name}</span>
          <ChevronDownIcon className="hidden sm:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
          <span className="text-xs font-normal text-muted-foreground">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={() => startTransition(() => logoutAction())}>
          <LogOutIcon aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
