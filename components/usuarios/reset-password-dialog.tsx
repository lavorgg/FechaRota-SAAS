"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { resetPasswordAction } from "@/app/app/usuarios/actions";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { UserDTO } from "@/lib/services/users";
import { type ResetPasswordData, resetPasswordSchema } from "@/lib/validation/users";
import type { z } from "zod";

type Values = z.input<typeof resetPasswordSchema>;

export function ResetPasswordDialog({ user, onOpenChange }: { user: UserDTO | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{user && <ResetForm user={user} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function ResetForm({ user, onDone }: { user: UserDTO; onDone: () => void }) {
  const form = useForm<Values, unknown, ResetPasswordData>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { id: user.id, password: "" } });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    startTransition(async () => {
      const result = await resetPasswordAction(form.getValues());
      if (result.ok) {
        toast.success(`Nova senha definida para ${user.name}.`);
        onDone();
      } else {
        setServerError(result.error);
        applyServerFieldErrors(form, result);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Redefinir senha</DialogTitle>
        <DialogDescription>
          {user.name} vai precisar entrar de novo com a nova senha em todos os aparelhos.
        </DialogDescription>
      </DialogHeader>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <Field data-invalid={Boolean(errors.password)}>
        <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
        <Input id="new-password" type="password" autoComplete="new-password" autoFocus aria-invalid={Boolean(errors.password)} {...form.register("password")} />
        <FieldDescription>Pelo menos 8 caracteres.</FieldDescription>
        <FieldError errors={[errors.password]} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Definir senha"}
        </Button>
      </DialogFooter>
    </form>
  );
}
