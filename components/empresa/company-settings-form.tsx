"use client";

// Configurações da empresa: dados básicos e endereço do depósito (partida do Google Maps).

import { zodResolver } from "@hookform/resolvers/zod";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { previewRetentionAction, updateCompanySettingsAction } from "@/app/app/empresa/actions";
import { ConfirmDialog } from "@/components/lista/confirm-dialog";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCep } from "@/domain/cep";
import { PROOF_POLICIES, PROOF_POLICY_LABELS } from "@/domain/delivery";
import { RETENTION_MONTHS_MAX, RETENTION_MONTHS_MIN } from "@/domain/retention";
import { formatDocument } from "@/domain/document";
import { BRAZILIAN_STATES, formatPhoneBR } from "@/domain/normalize";
import { lookupCep } from "@/lib/cep-lookup";
import type { CompanySettingsDTO } from "@/lib/services/company";
import { BRAZIL_TIMEZONES } from "@/lib/validation/common";
import { type CompanySettingsData, type CompanySettingsInput, companySettingsSchema } from "@/lib/validation/routes";

const NO_STATE = "sem-uf";

function defaults(company: CompanySettingsDTO): CompanySettingsInput {
  return {
    name: company.name,
    cnpj: company.cnpj ? formatDocument(company.cnpj) : "",
    phone: company.phone ? formatPhoneBR(company.phone) : "",
    timezone: company.timezone,
    proofPolicy: company.proofPolicy,
    fileRetentionMonths: String(company.fileRetentionMonths),
    depotZipCode: company.depotZipCode ? formatCep(company.depotZipCode) : "",
    depotStreet: company.depotStreet ?? "",
    depotNumber: company.depotNumber ?? "",
    depotComplement: company.depotComplement ?? "",
    depotNeighborhood: company.depotNeighborhood ?? "",
    depotCity: company.depotCity ?? "",
    depotState: company.depotState ?? "",
    depotLatitude: company.depotLatitude === null ? "" : String(company.depotLatitude),
    depotLongitude: company.depotLongitude === null ? "" : String(company.depotLongitude),
  };
}

export function CompanySettingsForm({ company, readOnly }: { company: CompanySettingsDTO; readOnly: boolean }) {
  const router = useRouter();
  const form = useForm<CompanySettingsInput, unknown, CompanySettingsData>({ resolver: zodResolver(companySettingsSchema), defaultValues: defaults(company) });
  const [serverError, setServerError] = useState<string | null>(null);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [searchingCep, setSearchingCep] = useState(false);
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  async function searchCep() {
    setCepMessage(null);
    setSearchingCep(true);
    const result = await lookupCep(form.getValues("depotZipCode") ?? "");
    setSearchingCep(false);
    if (!result.ok) {
      setCepMessage(result.error);
      return;
    }
    if (result.street) form.setValue("depotStreet", result.street, { shouldValidate: true });
    if (result.neighborhood) form.setValue("depotNeighborhood", result.neighborhood, { shouldValidate: true });
    if (result.city) form.setValue("depotCity", result.city, { shouldValidate: true });
    if ((BRAZILIAN_STATES as readonly string[]).includes(result.state)) form.setValue("depotState", result.state, { shouldValidate: true });
    setCepMessage("Endereço preenchido pelo CEP. Confira e informe o número.");
    document.getElementById("depotNumber")?.focus();
  }

  const [retentionWarning, setRetentionWarning] = useState<{ months: number; files: number } | null>(null);

  function save() {
    setServerError(null);
    startTransition(async () => {
      const result = await updateCompanySettingsAction(form.getValues());
      if (result.ok) {
        toast.success("Dados da empresa salvos.");
        form.reset(defaults(result.data));
        router.refresh();
      } else {
        setServerError(result.error);
        applyServerFieldErrors(form, result);
      }
    });
  }

  // Reduzir a retenção apaga arquivos na próxima madrugada: antes, mostra quantos.
  const onSubmit = form.handleSubmit((data) => {
    if (data.fileRetentionMonths >= company.fileRetentionMonths) {
      save();
      return;
    }
    startTransition(async () => {
      const preview = await previewRetentionAction({ months: data.fileRetentionMonths });
      if (!preview.ok) {
        setServerError(preview.error);
        return;
      }
      if (preview.data.files === 0) save();
      else setRetentionWarning({ months: data.fileRetentionMonths, files: preview.data.files });
    });
  });

  const text = (name: Exclude<keyof CompanySettingsInput, "depotState">, label: string, props: React.ComponentProps<typeof Input> = {}) => (
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
          <FieldLegend>Empresa</FieldLegend>
          <FieldGroup>
            {text("name", "Nome da empresa")}
            <div className="grid gap-4 md:grid-cols-2">
              {text("cnpj", "CNPJ (opcional)", { placeholder: "00.000.000/0000-00" })}
              {text("phone", "Telefone (opcional)", { type: "tel", inputMode: "tel", placeholder: "(16) 3333-0000" })}
            </div>
            <FieldDescription>O nome e o CNPJ saem no cabeçalho dos romaneios.</FieldDescription>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Operação</FieldLegend>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.timezone)}>
              <FieldLabel htmlFor="timezone">Fuso horário</FieldLabel>
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="timezone" className="w-full md:w-96">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZIL_TIMEZONES.map((zone) => (
                        <SelectItem key={zone.value} value={zone.value}>
                          {zone.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>Define o que é &quot;hoje&quot; no painel e na área do motorista. As datas de entrega já lançadas não mudam.</FieldDescription>
              <FieldError errors={[errors.timezone]} />
            </Field>
            <Field data-invalid={Boolean(errors.proofPolicy)}>
              <FieldLabel htmlFor="proofPolicy">Comprovante de entrega</FieldLabel>
              <Controller
                control={form.control}
                name="proofPolicy"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="proofPolicy" className="w-full md:w-96">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROOF_POLICIES.map((policy) => (
                        <SelectItem key={policy} value={policy}>
                          {PROOF_POLICY_LABELS[policy]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>Vale para as rotas iniciadas depois da mudança. Rotas já em andamento seguem a regra do início.</FieldDescription>
              <FieldError errors={[errors.proofPolicy]} />
            </Field>
            {text("fileRetentionMonths", "Guardar fotos e assinaturas por (meses)", { type: "number", inputMode: "numeric", min: RETENTION_MONTHS_MIN, max: RETENTION_MONTHS_MAX, className: "md:w-40" })}
            <FieldDescription>
              De {RETENTION_MONTHS_MIN} a {RETENTION_MONTHS_MAX} meses. Depois disso, os arquivos são apagados toda madrugada; o comprovante continua, sem as imagens.
            </FieldDescription>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Endereço do depósito</FieldLegend>
          <FieldDescription>Ponto de partida do link de rota no Google Maps. Sem ele, o Maps parte da localização do aparelho.</FieldDescription>
          <FieldGroup>
            <div className="grid items-start gap-4 md:grid-cols-[12rem_auto_1fr]">
              {text("depotZipCode", "CEP", { inputMode: "numeric", placeholder: "00000-000" })}
              <div className="md:pt-6">
                <Button type="button" variant="outline" onClick={searchCep} disabled={searchingCep}>
                  <SearchIcon aria-hidden />
                  {searchingCep ? "Buscando..." : "Buscar CEP"}
                </Button>
              </div>
              {cepMessage && (
                <p className="self-center text-sm text-muted-foreground md:pt-6" role="status">
                  {cepMessage}
                </p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
              {text("depotStreet", "Rua")}
              {text("depotNumber", "Número")}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {text("depotComplement", "Complemento (opcional)")}
              {text("depotNeighborhood", "Bairro")}
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
              {text("depotCity", "Cidade")}
              <Field data-invalid={Boolean(errors.depotState)}>
                <FieldLabel htmlFor="depotState">UF</FieldLabel>
                <Controller
                  control={form.control}
                  name="depotState"
                  render={({ field }) => (
                    <Select value={field.value ? field.value : NO_STATE} onValueChange={(value) => field.onChange(value === NO_STATE ? "" : value)} disabled={readOnly}>
                      <SelectTrigger id="depotState" className="w-full" aria-invalid={Boolean(errors.depotState)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_STATE}>—</SelectItem>
                        {BRAZILIAN_STATES.map((uf) => (
                          <SelectItem key={uf} value={uf}>
                            {uf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.depotState]} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {text("depotLatitude", "Latitude (opcional)", { inputMode: "decimal", placeholder: "-21.1775" })}
              {text("depotLongitude", "Longitude (opcional)", { inputMode: "decimal", placeholder: "-47.8103" })}
            </div>
            <FieldDescription>Com latitude e longitude, o Maps parte do ponto exato do depósito.</FieldDescription>
          </FieldGroup>
        </FieldSet>
      </fieldset>
      <div>
        <Button type="submit" disabled={pending || readOnly}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
      <ConfirmDialog
        open={retentionWarning !== null}
        onOpenChange={(open) => !open && setRetentionWarning(null)}
        title={`Reduzir a retenção para ${retentionWarning?.months ?? ""} meses?`}
        description={`${retentionWarning?.files ?? 0} ${retentionWarning?.files === 1 ? "foto ou assinatura" : "fotos e assinaturas"} de comprovante já ${retentionWarning?.files === 1 ? "passou" : "passaram"} desse prazo e ${retentionWarning?.files === 1 ? "será apagada" : "serão apagadas"} de vez na próxima madrugada. Os comprovantes continuam, sem as imagens.`}
        confirmLabel="Reduzir e apagar"
        pending={pending}
        onConfirm={() => {
          setRetentionWarning(null);
          save();
        }}
      />
    </form>
  );
}
