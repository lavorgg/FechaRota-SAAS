"use client";

import { Trash2Icon } from "lucide-react";
import { type KeyboardEvent, type RefObject, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { formatCents, parseBRLToCents } from "@/domain/money";
import { type ProductUnit, calcSubtotalCents, milliToInput, parseQuantityToMilli, validateQuantityForUnit } from "@/domain/quantity";
import { matchesSearch, searchTokens } from "@/domain/search";

export type CatalogItem = { id: string; sku: string; name: string; unit: ProductUnit; priceCents: number; searchText: string };
export type EditorLine = { key: string; productId: string; productName: string; quantity: string; unitPrice?: string };

const MAX_MATCHES = 8;

let keySeq = 0;
export function newLineKey(): string {
  keySeq += 1;
  return `linha-${Date.now()}-${keySeq}`;
}

/** Preço da linha mostrado na tela: o do template (se houver) ou o do cadastro. */
function linePriceCents(line: EditorLine, product: CatalogItem | undefined): number | null {
  if (line.unitPrice && line.unitPrice.trim()) {
    const parsed = parseBRLToCents(line.unitPrice);
    return parsed.ok ? parsed.cents : null;
  }
  return product?.priceCents ?? null;
}

/** Subtotal da linha para o total ao vivo (o servidor recalcula ao salvar). */
export function previewSubtotal(line: EditorLine, product: CatalogItem | undefined): { cents: number | null; error: string | null } {
  if (!product) return { cents: null, error: "Produto inativo ou fora do catálogo." };
  const parsed = parseQuantityToMilli(line.quantity);
  const checked = parsed.ok ? validateQuantityForUnit(parsed.milli, product.unit) : parsed;
  if (!checked.ok) return { cents: null, error: checked.error };
  const price = linePriceCents(line, product);
  if (price === null) return { cents: null, error: "Preço inválido." };
  return { cents: calcSubtotalCents(checked.milli, price), error: null };
}

type Props = {
  catalog: CatalogItem[];
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  /** Erros por linha vindos do servidor. */
  lineErrors?: Record<number, string>;
  /** Templates: preço combinado opcional por item. */
  withPrice?: boolean;
  /** Ref da busca de produto (para o formulário pôr o foco nela). */
  searchRef?: RefObject<HTMLInputElement | null>;
};

/**
 * Itens do pedido no teclado (seção 5.5): digite SKU ou nome, `Enter` adiciona com a
 * quantidade 1; `Tab` vai para a quantidade e `Enter` lá adiciona com a quantidade digitada.
 */
export function ItemsEditor({ catalog, lines, onChange, lineErrors, withPrice = false, searchRef }: Props) {
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const [quantity, setQuantity] = useState("1");
  const ownSearchRef = useRef<HTMLInputElement | null>(null);
  const innerSearchRef = searchRef ?? ownSearchRef;
  const byId = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);

  const matches = useMemo(() => {
    const tokens = searchTokens(search);
    if (tokens.length === 0) return [];
    const term = search.trim().toUpperCase();
    const found = catalog.filter((product) => matchesSearch(product.searchText, tokens));
    // SKU exato primeiro.
    found.sort((a, b) => Number(b.sku === term) - Number(a.sku === term));
    return found.slice(0, MAX_MATCHES);
  }, [catalog, search]);

  function add(productId: string, typedQuantity: string) {
    const product = byId.get(productId);
    if (!product) return;
    const qty = typedQuantity.trim() || "1";
    const existing = lines.findIndex((line) => line.productId === productId);
    const added = parseQuantityToMilli(qty);
    if (existing >= 0 && added.ok) {
      const current = parseQuantityToMilli(lines[existing]?.quantity ?? "");
      if (current.ok) {
        onChange(lines.map((line, index) => (index === existing ? { ...line, quantity: milliToInput(current.milli + added.milli) } : line)));
        reset();
        return;
      }
    }
    onChange([...lines, { key: newLineKey(), productId, productName: product.name, quantity: qty, unitPrice: withPrice ? "" : undefined }]);
    reset();
  }

  function reset() {
    setSearch("");
    setQuantity("1");
    setHighlighted("");
    innerSearchRef.current?.focus();
  }

  function onQuantityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const target = highlighted || matches[0]?.id;
    if (target) add(target, quantity);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_6rem] items-start gap-2">
        <Command label="Buscar produto" shouldFilter={false} value={highlighted} onValueChange={setHighlighted} className="overflow-visible bg-transparent p-0">
          <CommandInput
            ref={innerSearchRef}
            value={search}
            onValueChange={setSearch}
            placeholder="Produto: SKU ou nome"
          />
          {search.trim() && (
            <CommandList className="mt-1 max-h-64 rounded-lg border bg-popover shadow-sm" aria-label="Produtos encontrados">
              <CommandEmpty>Nenhum produto ativo encontrado.</CommandEmpty>
              {matches.map((product) => (
                <CommandItem key={product.id} value={product.id} onSelect={() => add(product.id, quantity)}>
                  <span className="font-medium">{product.sku}</span>
                  <span className="truncate">{product.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {formatCents(product.priceCents)}/{product.unit}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          )}
        </Command>
        <Input aria-label="Quantidade do novo item" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} onKeyDown={onQuantityKeyDown} onFocus={(event) => event.target.select()} />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          <Kbd>Enter</Kbd> adiciona
        </span>
        <span>
          <Kbd>Tab</Kbd> vai para a quantidade
        </span>
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> escolhem o produto
        </span>
      </p>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum item ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border" aria-label="Itens">
          {lines.map((line, index) => {
            const product = byId.get(line.productId);
            const preview = previewSubtotal(line, product);
            const error = lineErrors?.[index] ?? preview.error;
            return (
              <li key={line.key} className="flex flex-col gap-1 p-2">
                <div className="grid grid-cols-[1fr_5.5rem_auto] items-center gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product?.name ?? line.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {product ? `${product.sku} · ${formatCents(linePriceCents(line, product) ?? product.priceCents)}/${product.unit}` : "Produto indisponível"}
                    </p>
                  </div>
                  <Input
                    aria-label={`Quantidade de ${product?.name ?? line.productName}`}
                    inputMode="decimal"
                    value={line.quantity}
                    aria-invalid={Boolean(error)}
                    onChange={(event) => onChange(lines.map((l, i) => (i === index ? { ...l, quantity: event.target.value } : l)))}
                  />
                  <div className="flex items-center gap-2">
                    <span className="w-24 text-right text-sm tabular-nums">{preview.cents === null ? "—" : formatCents(preview.cents)}</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover ${product?.name ?? line.productName}`} onClick={() => onChange(lines.filter((_, i) => i !== index))}>
                      <Trash2Icon aria-hidden />
                    </Button>
                  </div>
                </div>
                {withPrice && (
                  <Input
                    aria-label={`Preço combinado de ${product?.name ?? line.productName}`}
                    inputMode="decimal"
                    placeholder="Preço combinado (vazio = preço do dia)"
                    className="h-7 max-w-64 text-xs"
                    value={line.unitPrice ?? ""}
                    onChange={(event) => onChange(lines.map((l, i) => (i === index ? { ...l, unitPrice: event.target.value } : l)))}
                  />
                )}
                {error && (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Total ao vivo (só das linhas válidas). */
export function previewTotal(lines: EditorLine[], catalog: CatalogItem[]): { cents: number; complete: boolean } {
  const byId = new Map(catalog.map((product) => [product.id, product]));
  let cents = 0;
  let complete = true;
  for (const line of lines) {
    const preview = previewSubtotal(line, byId.get(line.productId));
    if (preview.cents === null) complete = false;
    else cents += preview.cents;
  }
  return { cents, complete };
}
