"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { createCustomerAction, updateCustomerAction } from "@/app/app/clientes/actions";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCep } from "@/domain/cep";
import { formatDocument } from "@/domain/document";
import { BRAZILIAN_STATES, formatPhoneBR } from "@/domain/normalize";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/domain/payment";
import { lookupCep } from "@/lib/cep-lookup";
import type { CustomerDTO } from "@/lib/services/customers";
import { type UpdateCustomerData, type UpdateCustomerInput, updateCustomerSchema } from "@/lib/validation/catalog";

function defaults(customer: CustomerDTO | null): UpdateCustomerInput {
  return {
    id: customer?.id ?? "novo",
    name: customer?.name ?? "",
    legalName: customer?.legalName ?? "",
    document: customer?.document ? formatDocument(customer.document) : "",
    phone: customer?.phone ? formatPhoneBR(customer.phone) : "",
    zipCode: customer ? formatCep(customer.zipCode) : "",
    street: customer?.street ?? "",
    number: customer?.number ?? "",
    complement: customer?.complement ?? "",
    neighborhood: customer?.neighborhood ?? "",
    city: customer?.city ?? "",
    state: (customer?.state as UpdateCustomerInput["state"] | undefined) ?? "SP",
    referencePoint: customer?.referencePoint ?? "",
    latitude: customer?.latitude === null || customer?.latitude === undefined ? "" : String(customer.latitude),
    longitude: customer?.longitude === null || customer?.longitude === undefined ? "" : String(customer.longitude),
    defaultPaymentMethod: customer?.defaultPaymentMethod ?? "DINHEIRO",
    deliveryWindow: customer?.deliveryWindow ?? "",
    notes: customer?.notes ?? "",
  };
}

export function CustomerForm({ customer, readOnly }: { customer: CustomerDTO | null; readOnly: boolean }) {
  const router = useRouter();
  const form = useForm<UpdateCustomerInput, unknown, UpdateCustomerData>({ resolver: zodResolver(updateCustomerSchema), defaultValues: defaults(customer) });
  const [serverError, setServerError] = useState<string | null>(null);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [searchingCep, setSearchingCep] = useState(false);
  const { errors } = form.formState;

  async function searchCep() {
    setCepMessage(null);
    setSearchingCep(true);
    const result = await lookupCep(form.getValues("zipCode") ?? "");
    setSearchingCep(false);
    if (!result.ok) {
      setCepMessage(result.error);
      return;
    }
    // Só preenche o que veio; o número e o complemento são sempre digitados.
    if (result.street) form.setValue("street", result.street, { shouldValidate: true });
    if (result.neighborhood) form.setValue("neighborhood", result.neighborhood, { shouldValidate: true });
    if (result.city) form.setValue("city", result.city, { shouldValidate: true });
    if ((BRAZILIAN_STATES as readonly string[]).includes(result.state)) form.setValue("state", result.state as UpdateCustomerInput["state"], { shouldValidate: true });
    setCepMessage("Endereço preenchido pelo CEP. Confira e informe o número.");
    document.getElementById("number")?.focus();
  }

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    startTransition(async () => {
      const { id, ...values } = form.getValues();
      const result = customer ? await updateCustomerAction({ id, ...values }) : await createCustomerAction(values);
      if (result.ok) {
        toast.success(customer ? "Cliente salvo." : "Cliente cadastrado.");
        if (!customer) router.push(`/app/clientes/${result.data.id}`);
        else router.refresh();
      } else {
        setServerError(result.error);
        applyServerFieldErrors(form, result);
      }
    });
  });

  const text = (name: keyof UpdateCustomerInput, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field data-invalid={Boolean(errors[name])}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} aria-invalid={Boolean(errors[name])} {...props} {...form.register(name)} />
      <FieldError errors={[errors[name]]} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-6">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        <FieldSet>
          <FieldLegend>Identificação</FieldLegend>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              {text("name", "Nome (como é conhecido)", { autoFocus: !customer })}
              {text("legalName", "Razão social (opcional)")}
              {text("document", "CPF ou CNPJ (opcional)", { placeholder: "00.000.000/0000-00" })}
              {text("phone", "Telefone / WhatsApp (opcional)", { type: "tel", inputMode: "tel", placeholder: "(16) 99999-0000" })}
            </div>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Endereço de entrega</FieldLegend>
          <FieldGroup>
            <div className="grid items-start gap-4 md:grid-cols-[12rem_auto_1fr]">
              <Field data-invalid={Boolean(errors.zipCode)}>
                <FieldLabel htmlFor="zipCode">CEP</FieldLabel>
                <Input id="zipCode" inputMode="numeric" placeholder="00000-000" aria-invalid={Boolean(errors.zipCode)} {...form.register("zipCode")} />
                <FieldError errors={[errors.zipCode]} />
              </Field>
              <div className="md:pt-6">
                <Button type="button" variant="outline" onClick={searchCep} disabled={searchingCep}>
                  <SearchIcon aria-hidden />
                  {searchingCep ? "Buscando..." : "Buscar CEP"}
                </Button>
              </div>
              {cepMessage && <p className="self-center text-sm text-muted-foreground md:pt-6" role="status">{cepMessage}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
              {text("street", "Rua")}
              {text("number", "Número")}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {text("complement", "Complemento (opcional)")}
              {text("neighborhood", "Bairro")}
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
              {text("city", "Cidade")}
              <Field data-invalid={Boolean(errors.state)}>
                <FieldLabel htmlFor="state">UF</FieldLabel>
                <Controller
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                      <SelectTrigger id="state" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BRAZILIAN_STATES.map((uf) => (
                          <SelectItem key={uf} value={uf}>
                            {uf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.state]} />
              </Field>
            </div>
            {text("referencePoint", "Ponto de referência (opcional)")}
            <div className="grid gap-4 md:grid-cols-2">
              {text("latitude", "Latitude (opcional)", { inputMode: "decimal", placeholder: "-21.1775" })}
              {text("longitude", "Longitude (opcional)", { inputMode: "decimal", placeholder: "-47.8103" })}
            </div>
            <FieldDescription>Com latitude e longitude, o botão &quot;Navegar&quot; do motorista leva ao ponto exato.</FieldDescription>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Entrega e pagamento</FieldLegend>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(errors.defaultPaymentMethod)}>
                <FieldLabel htmlFor="defaultPaymentMethod">Forma de pagamento padrão</FieldLabel>
                <Controller
                  control={form.control}
                  name="defaultPaymentMethod"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                      <SelectTrigger id="defaultPaymentMethod" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method} value={method}>
                            {PAYMENT_METHOD_LABELS[method]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>Pix e dinheiro são cobrados pelo motorista; boleto e faturado não.</FieldDescription>
              </Field>
              {text("deliveryWindow", "Janela de entrega (opcional)", { placeholder: "6h às 9h" })}
            </div>
            <Field data-invalid={Boolean(errors.notes)}>
              <FieldLabel htmlFor="notes">Observações (opcional)</FieldLabel>
              <Textarea id="notes" rows={3} aria-invalid={Boolean(errors.notes)} {...form.register("notes")} />
              <FieldError errors={[errors.notes]} />
            </Field>
          </FieldGroup>
        </FieldSet>
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || readOnly}>
          {pending ? "Salvando..." : customer ? "Salvar alterações" : "Cadastrar cliente"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/app/clientes")}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
