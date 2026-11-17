"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { signupAction } from "@/app/actions/auth";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type SignupData, type SignupInput, signupSchema } from "@/lib/validation/auth";
import { BRAZIL_TIMEZONES } from "@/lib/validation/common";

export function SignupForm() {
  const form = useForm<SignupInput, unknown, SignupData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      companyName: "",
      cnpj: "",
      timezone: "America/Sao_Paulo",
      adminName: "",
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    startTransition(async () => {
      const result = await signupAction(form.getValues());
      if (!result.ok) {
        setServerError(result.error);
        applyServerFieldErrors(form, result);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <FieldSet>
        <FieldLegend>Empresa</FieldLegend>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.companyName)}>
            <FieldLabel htmlFor="companyName">Nome da empresa</FieldLabel>
            <Input id="companyName" autoComplete="organization" aria-invalid={Boolean(errors.companyName)} {...form.register("companyName")} />
            <FieldError errors={[errors.companyName]} />
          </Field>
          <Field data-invalid={Boolean(errors.cnpj)}>
            <FieldLabel htmlFor="cnpj">CNPJ (opcional)</FieldLabel>
            <Input id="cnpj" inputMode="text" placeholder="00.000.000/0000-00" aria-invalid={Boolean(errors.cnpj)} {...form.register("cnpj")} />
            <FieldError errors={[errors.cnpj]} />
          </Field>
          <Field data-invalid={Boolean(errors.timezone)}>
            <FieldLabel htmlFor="timezone">Fuso horário</FieldLabel>
            <Controller
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="timezone" className="w-full" aria-invalid={Boolean(errors.timezone)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAZIL_TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>Define o que é &quot;hoje&quot; para pedidos e rotas.</FieldDescription>
            <FieldError errors={[errors.timezone]} />
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Administrador</FieldLegend>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.adminName)}>
            <FieldLabel htmlFor="adminName">Seu nome</FieldLabel>
            <Input id="adminName" autoComplete="name" aria-invalid={Boolean(errors.adminName)} {...form.register("adminName")} />
            <FieldError errors={[errors.adminName]} />
          </Field>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={Boolean(errors.email)} {...form.register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...form.register("password")} />
            <FieldDescription>Pelo menos 8 caracteres.</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={Boolean(errors.passwordConfirmation)}>
            <FieldLabel htmlFor="passwordConfirmation">Repita a senha</FieldLabel>
            <Input id="passwordConfirmation" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.passwordConfirmation)} {...form.register("passwordConfirmation")} />
            <FieldError errors={[errors.passwordConfirmation]} />
          </Field>
        </FieldGroup>
      </FieldSet>
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending ? "Criando conta..." : "Criar conta"}
      </Button>
    </form>
  );
}
