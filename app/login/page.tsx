import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentSession } from "@/lib/auth/current";
import { homePathFor } from "@/lib/auth/permissions";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await getCurrentSession();
  if (session) redirect(homePathFor(session.user.role));

  const { proximo } = await searchParams;
  const next = safeNextPath(Array.isArray(proximo) ? proximo[0] : proximo);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar no FechaRota</h1>
        <p className="text-muted-foreground">Use o e-mail e a senha cadastrados pela sua empresa.</p>
      </div>
      <LoginForm next={next} />
      <p className="text-sm text-muted-foreground">
        Empresa nova?{" "}
        <Link className="font-medium text-primary underline underline-offset-4" href="/cadastro">
          Criar conta
        </Link>
      </p>
    </main>
  );
}
