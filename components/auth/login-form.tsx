"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { loginAction } from "@/app/actions/auth";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type LoginInput, loginSchema } from "@/lib/validation/auth";

// Campos com 48px de altura: o motorista entra pelo celular (seção 5.2).
export function LoginForm({ next }: { next: string | null }) {
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", next: next ?? undefined },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    startTransition(async () => {
      const result = await loginAction(form.getValues());
      if (result.ok) {
        // Carregamento completo (ver loginAction). O destino já foi validado no servidor.
        window.location.assign(result.data.destination);
        return;
      }
      setServerError(result.error);
      applyServerFieldErrors(form, result);
      form.setValue("password", "");
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" className="h-12 text-base" type="email" autoComplete="username" inputMode="email" autoFocus aria-invalid={Boolean(errors.email)} {...form.register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input id="password" className="h-12 text-base" type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} {...form.register("password")} />
          <FieldError errors={[errors.password]} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
