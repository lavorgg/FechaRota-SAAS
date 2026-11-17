import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Paginação no servidor. `hrefFor` monta a URL de cada página mantendo os filtros. */
export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Paginação" className="flex items-center gap-3">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={hrefFor(page - 1)}>Anterior</Link>
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
          <Link href={hrefFor(page + 1)}>Próxima</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Próxima
        </Button>
      )}
    </nav>
  );
}

/** URL da listagem com busca, situação e página. */
export function listHref(base: string, params: { q?: string; situacao?: string; pagina?: number }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.situacao && params.situacao !== "ativos") search.set("situacao", params.situacao);
  if (params.pagina && params.pagina > 1) search.set("pagina", String(params.pagina));
  const text = search.toString();
  return text ? `${base}?${text}` : base;
}
