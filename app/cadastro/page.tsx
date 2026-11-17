import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import { getCurrentSession } from "@/lib/auth/current";
import { homePathFor } from "@/lib/auth/permissions";
import { TRIAL_DAYS } from "@/lib/auth/plan";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignupPage() {
  const session = await getCurrentSession();
  if (session) redirect(homePathFor(session.user.role));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Criar conta da empresa</h1>
        <p className="text-muted-foreground">
          {TRIAL_DAYS} dias de teste. Você entra como administrador e cadastra a expedição e os motoristas depois.
        </p>
      </div>
      <SignupForm />
      <p className="text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link className="font-medium text-primary underline underline-offset-4" href="/login">
          Entrar
        </Link>
      </p>
    </main>
  );
}
