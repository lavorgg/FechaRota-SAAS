import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Busca e filtro de situação das listagens (formulário GET: a URL guarda o filtro e a página
 * volta ao início a cada busca).
 */
export function ListToolbar({ action, query, status, placeholder }: { action: string; query: string; status: string; placeholder: string }) {
  return (
    <form action={action} method="get" role="search" className="flex flex-wrap items-center gap-2">
      <Input name="q" defaultValue={query} placeholder={placeholder} aria-label={placeholder} className="w-full max-w-sm" />
      <select
        name="situacao"
        defaultValue={status}
        aria-label="Situação"
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="ativos">Ativos</option>
        <option value="inativos">Inativos</option>
        <option value="todos">Todos</option>
      </select>
      <Button type="submit" variant="outline">
        <SearchIcon aria-hidden />
        Buscar
      </Button>
    </form>
  );
}
