"use client";

import { LogOutIcon } from "lucide-react";
import { useTransition } from "react";

import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function DriverLogoutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" className="h-12 min-w-12 px-4 text-base" disabled={pending} onClick={() => startTransition(() => logoutAction())}>
      <LogOutIcon aria-hidden />
      Sair
    </Button>
  );
}
