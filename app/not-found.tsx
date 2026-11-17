import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium text-muted-foreground">Erro 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-muted-foreground">O endereço não existe ou você não tem acesso a ele.</p>
      <Button asChild>
        <Link href="/">Voltar ao início</Link>
      </Button>
    </main>
  );
}
