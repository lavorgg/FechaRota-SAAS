"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { createUserAction, updateUserAction } from "@/app/app/usuarios/actions";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhoneBR } from "@/domain/normalize";
import { ROLE_LABELS, USER_ROLES } from "@/lib/auth/permissions";
import type { UserDTO } from "@/lib/services/users";
import { type CreateUserData, type CreateUserInput, type UpdateUserData, type UpdateUserInput, createUserSchema, updateUserSchema } from "@/lib/validation/users";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem usuário = criar; com usuário = editar. */
  user: UserDTO | null;
  isSelf: boolean;
};

export function UserFormDialog({ open, onOpenChange, user, isSelf }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (user ? <EditForm user={user} isSelf={isSelf} onDone={() => onOpenChange(false)} /> : <CreateForm onDone={() => onOpenChange(false)} />)}
      </DialogContent>
    </Dialog>
  );
}

function RoleSelect({ value, onChange, disabled, invalid }: { value: string; onChange: (value: string) => void; disabled?: boolean; invalid: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id="role" className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder="Escolha o papel" />
      </SelectTrigger>
      <SelectContent>
        {USER_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const form = useForm<CreateUserInput, unknown, CreateUserData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", phone: "", role: "MOTORISTA", password: "" },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    startTransition(async () => {
      const result = await createUserAction(form.getValues());
      if (result.ok) {
        toast.success(`${result.data.name} cadastrado.`);
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
        <DialogTitle>Novo usuário</DialogTitle>
        <DialogDescription>Passe o e-mail e a senha inicial para a pessoa entrar.</DialogDescription>
      </DialogHeader>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="name">Nome</FieldLabel>
          <Input id="name" autoFocus aria-invalid={Boolean(errors.name)} {...form.register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" type="email" inputMode="email" autoComplete="off" aria-invalid={Boolean(errors.email)} {...form.register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={Boolean(errors.phone)}>
          <FieldLabel htmlFor="phone">Telefone (opcional)</FieldLabel>
          <Input id="phone" type="tel" inputMode="tel" placeholder="(16) 99999-0000" aria-invalid={Boolean(errors.phone)} {...form.register("phone")} />
          <FieldError errors={[errors.phone]} />
        </Field>
        <Field data-invalid={Boolean(errors.role)}>
          <FieldLabel htmlFor="role">Papel</FieldLabel>
          <Controller control={form.control} name="role" render={({ field }) => <RoleSelect value={field.value} onChange={field.onChange} invalid={Boolean(errors.role)} />} />
          <FieldError errors={[errors.role]} />
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Senha inicial</FieldLabel>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...form.register("password")} />
          <FieldDescription>Pelo menos 8 caracteres.</FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Cadastrar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditForm({ user, isSelf, onDone }: { user: UserDTO; isSelf: boolean; onDone: () => void }) {
  const form = useForm<UpdateUserInput, unknown, UpdateUserData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { id: user.id, name: user.name, email: user.email, phone: user.phone ? formatPhoneBR(user.phone) : "", role: user.role },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    startTransition(async () => {
      const result = await updateUserAction(form.getValues());
      if (result.ok) {
        toast.success("Alterações salvas.");
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
        <DialogTitle>Editar usuário</DialogTitle>
        <DialogDescription>Mudar o papel encerra as sessões abertas dessa pessoa.</DialogDescription>
      </DialogHeader>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="name">Nome</FieldLabel>
          <Input id="name" autoFocus aria-invalid={Boolean(errors.name)} {...form.register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" type="email" inputMode="email" autoComplete="off" aria-invalid={Boolean(errors.email)} {...form.register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={Boolean(errors.phone)}>
          <FieldLabel htmlFor="phone">Telefone (opcional)</FieldLabel>
          <Input id="phone" type="tel" inputMode="tel" aria-invalid={Boolean(errors.phone)} {...form.register("phone")} />
          <FieldError errors={[errors.phone]} />
        </Field>
        <Field data-invalid={Boolean(errors.role)}>
          <FieldLabel htmlFor="role">Papel</FieldLabel>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => <RoleSelect value={field.value} onChange={field.onChange} disabled={isSelf} invalid={Boolean(errors.role)} />}
          />
          {isSelf && <FieldDescription>Você não pode mudar o próprio papel.</FieldDescription>}
          <FieldError errors={[errors.role]} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
