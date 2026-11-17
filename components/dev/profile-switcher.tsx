"use client";

import { RepeatIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { impersonateAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/permissions";

/**
 * Troca rápida de perfil, só em desenvolvimento (seção 5.1). O servidor só renderiza este
 * componente quando a troca está habilitada, e a action confere de novo antes de agir.
 */
export function DevProfileSwitcher({ targets, currentUserId }: { targets: Array<{ id: string; name: string; role: UserRole }>; currentUserId: string }) {
  const [pending, startTransition] = useTransition();

  function switchTo(userId: string) {
    startTransition(async () => {
      const result = await impersonateAction({ userId });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="fixed right-3 bottom-3 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="border-dashed border-amber-500 bg-amber-50 text-amber-950 shadow-sm" disabled={pending}>
            <RepeatIcon aria-hidden />
            Trocar perfil (dev)
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Entrar como</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {targets.map((target) => (
            <DropdownMenuItem key={target.id} disabled={target.id === currentUserId} onSelect={() => switchTo(target.id)}>
              <span className="truncate">{target.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{ROLE_LABELS[target.role]}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
