"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontalIcon, PackageIcon, PlusIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { createProductAction, deleteProductAction, setProductActiveAction, updateProductAction } from "@/app/app/produtos/actions";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { ConfirmDialog } from "@/components/lista/confirm-dialog";
import { EmptyState } from "@/components/lista/empty-state";
import { ListToolbar } from "@/components/lista/list-toolbar";
import { Pagination, listHref } from "@/components/lista/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { centsToInput, formatCents } from "@/domain/money";
import { PRODUCT_UNITS, formatQuantity, milliToInput } from "@/domain/quantity";
import type { Page } from "@/lib/services/common";
import type { ProductDTO } from "@/lib/services/products";
import { type UpdateProductData, type UpdateProductInput, updateProductSchema } from "@/lib/validation/catalog";

type Container = { id: string; sku: string; name: string };
type Props = { result: Page<ProductDTO>; containers: Container[]; query: string; status: string; readOnly: boolean };

const NO_CONTAINER = "__nenhum__";

export function ProductsManager({ result, containers, query, status, readOnly }: Props) {
  const [editing, setEditing] = useState<ProductDTO | "novo" | null>(null);
  const [deleting, setDeleting] = useState<ProductDTO | null>(null);
  const [pending, startTransition] = useTransition();

  function setActive(product: ProductDTO, active: boolean) {
    startTransition(async () => {
      const r = await setProductActiveAction({ id: product.id, active });
      if (r.ok) toast.success(active ? "Produto reativado." : "Produto inativado.");
      else toast.error(r.error);
    });
  }

  function remove(product: ProductDTO) {
    startTransition(async () => {
      const r = await deleteProductAction({ id: product.id });
      if (r.ok) toast.success("Produto excluído.");
      else toast.error(r.error);
      setDeleting(null);
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground">
            {result.total} {result.total === 1 ? "produto" : "produtos"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {readOnly ? (
            <Button variant="outline" disabled>
              <UploadIcon aria-hidden />
              Importar CSV
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/app/produtos/importar">
                <UploadIcon aria-hidden />
                Importar CSV
              </Link>
            </Button>
          )}
          <Button onClick={() => setEditing("novo")} disabled={readOnly}>
            <PlusIcon aria-hidden />
            Novo produto
          </Button>
        </div>
      </div>
      <ListToolbar action="/app/produtos" query={query} status={status} placeholder="Buscar por SKU ou nome" />

      {result.items.length === 0 ? (
        <EmptyState
          icon={<PackageIcon className="size-6" aria-hidden />}
          title={query ? `Nenhum produto encontrado para "${query}".` : "Nenhum produto nesta lista."}
          description="Cadastre um a um ou importe uma planilha."
          action={
            <Button onClick={() => setEditing("novo")} disabled={readOnly}>
              Cadastrar produto
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Unid.</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="hidden text-right md:table-cell">Peso (kg)</TableHead>
                <TableHead className="hidden md:table-cell">Vasilhame</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((product) => (
                <TableRow key={product.id} className={product.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-medium">{product.sku}</TableCell>
                  <TableCell>
                    {product.name}
                    {product.isReturnableContainer && (
                      <Badge variant="secondary" className="ml-2">
                        Retornável
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{product.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(product.priceCents)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{product.weightGrams === null ? "—" : formatQuantity(product.weightGrams)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {product.containerSku ? `${product.containerSku}${product.unitsPerContainer ? ` (${product.unitsPerContainer}/vasilhame)` : ""}` : "—"}
                  </TableCell>
                  <TableCell>{product.active ? "Ativo" : "Inativo"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações para ${product.sku}`} disabled={readOnly || pending}>
                          <MoreHorizontalIcon aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(product)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setActive(product, !product.active)}>{product.active ? "Inativar" : "Reativar"}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(product)}>
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(pagina) => listHref("/app/produtos", { q: query, situacao: status, pagina })} />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && <ProductForm product={editing === "novo" ? null : editing} containers={containers} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Excluir ${deleting?.sku ?? ""}?`}
        description="Só dá para excluir produto que nunca entrou em pedido. Se já entrou, inative: ele some do lançamento e os pedidos antigos continuam iguais."
        confirmLabel="Excluir"
        pending={pending}
        onConfirm={() => deleting && remove(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  );
}

function ProductForm({ product, containers, onDone }: { product: ProductDTO | null; containers: Container[]; onDone: () => void }) {
  const form = useForm<UpdateProductInput, unknown, UpdateProductData>({
    resolver: zodResolver(updateProductSchema),
    defaultValues: {
      id: product?.id ?? "novo",
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      unit: product?.unit ?? "UN",
      price: product ? centsToInput(product.priceCents) : "",
      weightKg: product?.weightGrams ? milliToInput(product.weightGrams) : "",
      isReturnableContainer: product?.isReturnableContainer ?? false,
      containerProductId: product?.containerProductId ?? null,
      unitsPerContainer: product?.unitsPerContainer ? String(product.unitsPerContainer) : "",
    },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;
  const returnable = useWatch({ control: form.control, name: "isReturnableContainer" });
  const containerId = useWatch({ control: form.control, name: "containerProductId" });
  const options = containers.filter((c) => c.id !== product?.id);

  const onSubmit = form.handleSubmit(() => {
    setServerError(null);
    startTransition(async () => {
      const { id, ...values } = form.getValues();
      const result = product ? await updateProductAction({ id, ...values }) : await createProductAction(values);
      if (result.ok) {
        toast.success(product ? "Produto salvo." : "Produto cadastrado.");
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
        <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
        <DialogDescription>Mudar preço ou nome não altera pedidos já lançados.</DialogDescription>
      </DialogHeader>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field data-invalid={Boolean(errors.sku)}>
            <FieldLabel htmlFor="sku">SKU</FieldLabel>
            <Input id="sku" autoFocus className="uppercase" aria-invalid={Boolean(errors.sku)} {...form.register("sku")} />
            <FieldError errors={[errors.sku]} />
          </Field>
          <Field data-invalid={Boolean(errors.unit)}>
            <FieldLabel htmlFor="unit">Unidade</FieldLabel>
            <Controller
              control={form.control}
              name="unit"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="unit" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="name">Nome</FieldLabel>
          <Input id="name" aria-invalid={Boolean(errors.name)} {...form.register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(errors.price)}>
            <FieldLabel htmlFor="price">Preço (R$)</FieldLabel>
            <Input id="price" inputMode="decimal" placeholder="12,50" aria-invalid={Boolean(errors.price)} {...form.register("price")} />
            <FieldError errors={[errors.price]} />
          </Field>
          <Field data-invalid={Boolean(errors.weightKg)}>
            <FieldLabel htmlFor="weightKg">Peso por unidade (kg)</FieldLabel>
            <Input id="weightKg" inputMode="decimal" placeholder="1,050" aria-invalid={Boolean(errors.weightKg)} {...form.register("weightKg")} />
            <FieldError errors={[errors.weightKg]} />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Controller
            control={form.control}
            name="isReturnableContainer"
            render={({ field }) => (
              <Checkbox
                id="isReturnableContainer"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked === true);
                  if (checked === true) {
                    form.setValue("containerProductId", null);
                    form.setValue("unitsPerContainer", "");
                  }
                }}
              />
            )}
          />
          <FieldLabel htmlFor="isReturnableContainer">É vasilhame retornável (caixa, engradado)</FieldLabel>
        </Field>
        <FieldError errors={[errors.isReturnableContainer]} />
        {!returnable && (
          <div className="grid items-start gap-3 sm:grid-cols-[1fr_11rem]">
            <Field data-invalid={Boolean(errors.containerProductId)}>
              <FieldLabel htmlFor="containerProductId">Sai no vasilhame</FieldLabel>
              <Controller
                control={form.control}
                name="containerProductId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NO_CONTAINER}
                    onValueChange={(value) => {
                      field.onChange(value === NO_CONTAINER ? null : value);
                      if (value === NO_CONTAINER) form.setValue("unitsPerContainer", "");
                    }}
                  >
                    <SelectTrigger id="containerProductId" className="w-full" aria-invalid={Boolean(errors.containerProductId)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CONTAINER}>Nenhum</SelectItem>
                      {options.map((container) => (
                        <SelectItem key={container.id} value={container.id}>
                          {container.sku} · {container.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {options.length === 0 && <FieldDescription>Cadastre antes um produto marcado como retornável.</FieldDescription>}
              <FieldError errors={[errors.containerProductId]} />
            </Field>
            <Field data-invalid={Boolean(errors.unitsPerContainer)}>
              <FieldLabel htmlFor="unitsPerContainer">Unidades por vasilhame</FieldLabel>
              <Input id="unitsPerContainer" inputMode="numeric" disabled={!containerId} aria-invalid={Boolean(errors.unitsPerContainer)} {...form.register("unitsPerContainer")} />
              <FieldError errors={[errors.unitsPerContainer]} />
            </Field>
          </div>
        )}
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
