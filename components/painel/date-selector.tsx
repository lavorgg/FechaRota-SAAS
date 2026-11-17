"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, isValidDateString } from "@/domain/dates";
import { DATE_PARAM } from "@/lib/selected-date";

/**
 * Seletor de data global do painel (seção 5.2). A data fica na URL (?data=AAAA-MM-DD);
 * sem ela, vale "hoje" no fuso da empresa, calculado no servidor e recebido em `today`.
 */
export function DateSelector({ today }: { today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(DATE_PARAM);
  const selected = raw && isValidDateString(raw) ? raw : today;

  function go(date: string) {
    if (!isValidDateString(date)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (date === today) params.delete(DATE_PARAM);
    else params.set(DATE_PARAM, date);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5 sm:gap-1" role="group" aria-label="Data selecionada">
      <Button type="button" variant="ghost" size="icon" onClick={() => go(addDays(selected, -1))} aria-label="Dia anterior">
        <ChevronLeftIcon aria-hidden />
      </Button>
      <Input
        type="date"
        aria-label="Data"
        className="h-8 w-[8.75rem] px-2 sm:w-[9.5rem] sm:px-2.5"
        value={selected}
        onChange={(event) => go(event.target.value)}
      />
      <Button type="button" variant="ghost" size="icon" onClick={() => go(addDays(selected, 1))} aria-label="Próximo dia">
        <ChevronRightIcon aria-hidden />
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => go(today)} disabled={selected === today}>
        Hoje
      </Button>
    </div>
  );
}
