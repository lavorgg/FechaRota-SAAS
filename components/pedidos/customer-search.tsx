"use client";

import { type Ref, useEffect, useRef, useState } from "react";

import { searchOrderCustomersAction } from "@/app/app/pedidos/actions";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { formatPhoneBR } from "@/domain/normalize";
import type { OrderCustomerOption } from "@/lib/services/orders";

const DEBOUNCE_MS = 200;

/**
 * Busca de cliente do lançamento rápido (seção 5.5): nome, bairro ou telefone, no servidor,
 * sem diferenciar maiúsculas nem acentos, com espera de 200 ms entre as teclas.
 */
export function CustomerSearch({ onSelect, inputRef }: { onSelect: (customer: OrderCustomerOption) => void; inputRef?: Ref<HTMLInputElement> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrderCustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const id = ++requestId.current;
    if (!q) {
      const clear = setTimeout(() => {
        setResults([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(clear);
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await searchOrderCustomersAction({ q });
      // Resposta de uma busca antiga (o usuário continuou digitando): descarta.
      if (id !== requestId.current) return;
      setLoading(false);
      if (response.ok) {
        setResults(response.data);
        setError(null);
      } else {
        setResults([]);
        setError(response.error);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Command label="Buscar cliente" shouldFilter={false} className="overflow-visible bg-transparent p-0">
      <CommandInput ref={inputRef} value={query} onValueChange={setQuery} placeholder="Cliente: nome, bairro ou telefone" />
      {query.trim() && (
        <CommandList className="mt-1 max-h-72 rounded-lg border bg-popover shadow-sm" aria-label="Clientes encontrados">
          {!loading && <CommandEmpty>{error ?? "Nenhum cliente ativo encontrado."}</CommandEmpty>}
          {loading && results.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Buscando...</p>}
          {results.map((customer) => (
            <CommandItem key={customer.id} value={customer.id} onSelect={() => onSelect(customer)}>
              <span className="font-medium">{customer.name}</span>
              <span className="truncate text-muted-foreground">
                {customer.neighborhood} · {customer.city}
              </span>
              {customer.phone && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatPhoneBR(customer.phone)}</span>}
            </CommandItem>
          ))}
        </CommandList>
      )}
    </Command>
  );
}
