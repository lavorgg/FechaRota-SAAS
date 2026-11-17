"use client";

import { CheckCircle2Icon, DownloadIcon, FileWarningIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCsv, decodeCsvBytes, mapColumns, parseCsv } from "@/domain/csv";
import type { ActionResult } from "@/lib/actions/result";
import { IMPORT_BATCH_SIZE, type ImportBatchResult, validateImportRow } from "@/lib/validation/import";

type Row = { line: number; values: Record<string, string> };
type Checked = Row & { error: string | null };

type Props<C extends string> = {
  /** "produtos" ou "clientes": nome do arquivo de modelo e textos. */
  kind: string;
  columns: readonly C[];
  required: readonly C[];
  template: string[][];
  schema: z.ZodType<unknown>;
  /** Colunas mostradas na pré-visualização. */
  previewColumns: readonly C[];
  /** Ordem de envio (ex.: vasilhames antes dos produtos que saem neles). */
  sortForUpload?: (rows: Row[]) => Row[];
  upload: (input: { rows: Row[] }) => Promise<ActionResult<ImportBatchResult>>;
  backHref: string;
};

const PREVIEW_LIMIT = 100;

/**
 * Importação por CSV (seção 5.4): o arquivo é lido NO NAVEGADOR, validado linha a linha com as
 * mesmas regras do servidor e enviado em lotes de JSON (limite de corpo da seção 3.12).
 */
export function CsvImport<C extends string>({ kind, columns, required, template, schema, previewColumns, sortForUpload, upload, backHref }: Props<C>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<Checked[]>([]);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [report, setReport] = useState<{ created: number; errors: Array<{ line: number; error: string }>; failure: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = rows.filter((row) => row.error === null);
  const invalid = rows.filter((row) => row.error !== null);

  function downloadTemplate() {
    // BOM: o Excel só lê os acentos de um CSV UTF-8 com ele.
    const blob = new Blob(["﻿", buildCsv(template)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `modelo-${kind}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function readFile(file: File) {
    setReport(null);
    setRows([]);
    setFileError(null);
    setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) {
      setFileError("O arquivo passa de 5 MB. Divida em arquivos menores.");
      return;
    }
    const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    const mapped = mapColumns(parseCsv(text), columns, required);
    if (!mapped.ok) {
      setFileError(mapped.error);
      return;
    }
    setRows(
      mapped.rows.map((row) => {
        const checked = validateImportRow(schema, row.values);
        return { ...row, error: checked.ok ? null : checked.error };
      }),
    );
  }

  function send() {
    startTransition(async () => {
      const ordered = (sortForUpload ?? ((r: Row[]) => r))(valid.map(({ line, values }) => ({ line, values })));
      const errors: Array<{ line: number; error: string }> = invalid.map((row) => ({ line: row.line, error: row.error ?? "" }));
      let created = 0;
      let failure: string | null = null;
      setProgress({ sent: 0, total: ordered.length });
      for (let start = 0; start < ordered.length; start += IMPORT_BATCH_SIZE) {
        const batch = ordered.slice(start, start + IMPORT_BATCH_SIZE);
        const result = await upload({ rows: batch });
        if (!result.ok) {
          failure = `As linhas ${batch[0]?.line} a ${batch.at(-1)?.line} não foram importadas: ${result.error}`;
          break;
        }
        created += result.data.created;
        errors.push(...result.data.errors);
        setProgress({ sent: Math.min(start + IMPORT_BATCH_SIZE, ordered.length), total: ordered.length });
      }
      setProgress(null);
      setRows([]);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
      setReport({ created, errors: errors.sort((a, b) => a.line - b.line), failure });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">1. Baixe o modelo e preencha</h2>
        <p className="text-sm text-muted-foreground">
          Colunas obrigatórias: {required.join(", ")}. Pode salvar pelo Excel (separador &quot;;&quot;) ou por outro programa (&quot;,&quot;). Linhas
          com {kind === "produtos" ? "SKU" : "CPF/CNPJ"} já cadastrado são recusadas: nada que já existe é alterado.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <DownloadIcon aria-hidden />
            Baixar modelo
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">2. Escolha o arquivo</h2>
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm hover:bg-muted">
          <UploadIcon className="size-4" aria-hidden />
          <span>{fileName ?? "Selecionar arquivo .csv"}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Arquivo CSV"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
        </label>
        {fileError && (
          <Alert variant="destructive">
            <AlertDescription>{fileError}</AlertDescription>
          </Alert>
        )}
      </section>

      {rows.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">3. Confira e importe</h2>
          <p className="text-sm">
            <strong>{valid.length}</strong> {valid.length === 1 ? "linha válida" : "linhas válidas"} ·{" "}
            <strong className={invalid.length ? "text-destructive" : undefined}>{invalid.length}</strong> com erro
            {rows.length > PREVIEW_LIMIT && ` · mostrando as ${PREVIEW_LIMIT} primeiras`}
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Linha</TableHead>
                  {previewColumns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, PREVIEW_LIMIT).map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="tabular-nums">{row.line}</TableCell>
                    {previewColumns.map((column) => (
                      <TableCell key={column} className="max-w-48 truncate">
                        {row.values[column]}
                      </TableCell>
                    ))}
                    <TableCell className={row.error ? "text-destructive" : "text-emerald-700"}>{row.error ?? "OK"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={send} disabled={pending || valid.length === 0}>
              {pending && progress ? `Importando ${progress.sent} de ${progress.total}...` : `Importar ${valid.length} ${valid.length === 1 ? "linha" : "linhas"}`}
            </Button>
            {invalid.length > 0 && <span className="text-sm text-muted-foreground">As linhas com erro ficam de fora e entram no relatório.</span>}
          </div>
        </section>
      )}

      {report && (
        <section className="flex flex-col gap-3" aria-live="polite">
          <Alert>
            {report.errors.length === 0 && !report.failure ? <CheckCircle2Icon aria-hidden /> : <FileWarningIcon aria-hidden />}
            <AlertTitle>
              {report.created} {report.created === 1 ? "registro importado" : "registros importados"}
              {report.errors.length > 0 && `, ${report.errors.length} ${report.errors.length === 1 ? "linha recusada" : "linhas recusadas"}`}.
            </AlertTitle>
            {report.failure && <AlertDescription className="text-destructive">{report.failure}</AlertDescription>}
          </Alert>
          {report.errors.length > 0 && (
            <div className="max-h-[24rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Linha</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.errors.map((error) => (
                    <TableRow key={`${error.line}-${error.error}`}>
                      <TableCell className="tabular-nums">{error.line}</TableCell>
                      <TableCell>{error.error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div>
            <Button asChild variant="outline">
              <Link href={backHref}>Voltar para a lista</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
