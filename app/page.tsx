import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/auth/current";
import { homePathFor } from "@/lib/auth/permissions";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (session) redirect(homePathFor(session.user.role));

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">FechaRota</h1>
      <p className="text-lg text-muted-foreground">
        Romaneio de carga, sequência de entregas e comprovante de entrega para distribuidoras com frota própria.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/login">Entrar</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/cadastro">Criar conta da empresa</Link>
        </Button>
      </div>
    </main>
  );
}
