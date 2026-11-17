// Leitura e escrita de CSV para a importação de clientes e produtos (seção 5.4).
// Roda no navegador: o arquivo é lido lá e só os dados validados vão ao servidor.
//
// Planilhas no Brasil: o Excel salva com ";" (porque "," é o separador decimal) e, em muitas
// versões, em Windows-1252 em vez de UTF-8. As duas coisas são detectadas aqui.

export const MAX_IMPORT_ROWS = 5000;

/** Bytes do arquivo -> texto. Tenta UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** ";" ou ",", o que aparecer mais na primeira linha fora de aspas. */
export function detectDelimiter(text: string): ";" | "," {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char === ";") semicolons += 1;
    else if (!quoted && char === ",") commas += 1;
  }
  return semicolons >= commas ? ";" : ",";
}

export type CsvRecord = { line: number; cells: string[] };
export type ParsedCsv = { header: string[]; records: CsvRecord[] };

/**
 * CSV no formato RFC 4180: campos entre aspas podem ter o separador, aspas dobradas ("")
 * e quebras de linha. Linhas totalmente vazias são ignoradas. `line` é a linha do arquivo
 * onde o registro começa (o cabeçalho é a linha 1), para o relatório de erros.
 */
export function parseCsv(text: string, delimiter: ";" | "," = detectDelimiter(text)): ParsedCsv {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim() !== "")) records.push({ line: recordLine, cells });
    cells = [];
    cell = "";
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      cell += char;
    }
  }
  if (cell !== "" || cells.length > 0) endRecord();

  const [first, ...rest] = records;
  return { header: (first?.cells ?? []).map((value) => value.trim()), records: rest };
}

/** Nome de coluna normalizado: "Razão Social" -> "razao_social". */
export function normalizeHeader(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type MappedRows<K extends string> =
  | { ok: true; rows: Array<{ line: number; values: Record<K, string> }> }
  | { ok: false; error: string };

/** Associa cada registro às colunas esperadas, pelo nome do cabeçalho (ordem livre). */
export function mapColumns<K extends string>(parsed: ParsedCsv, columns: readonly K[], required: readonly K[]): MappedRows<K> {
  const index = new Map(parsed.header.map((name, position) => [normalizeHeader(name), position]));
  const missing = required.filter((column) => !index.has(column));
  if (missing.length > 0) {
    return { ok: false, error: `Colunas obrigatórias ausentes no cabeçalho: ${missing.join(", ")}.` };
  }
  if (parsed.records.length === 0) {
    return { ok: false, error: "O arquivo não tem nenhuma linha de dados." };
  }
  if (parsed.records.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `O arquivo tem ${parsed.records.length} linhas. O limite é ${MAX_IMPORT_ROWS} por importação.` };
  }
  return {
    ok: true,
    rows: parsed.records.map((record) => {
      const values = {} as Record<K, string>;
      for (const column of columns) {
        const position = index.get(column);
        values[column] = position === undefined ? "" : (record.cells[position] ?? "").trim();
      }
      return { line: record.line, values };
    }),
  };
}

/** Monta um CSV (separador ";", CRLF). Campos com separador, aspas ou quebra vão entre aspas. */
export function buildCsv(rows: ReadonlyArray<ReadonlyArray<string>>, delimiter: ";" | "," = ";"): string {
  const escape = (value: string) => (/[";,\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => row.map(escape).join(delimiter)).join("\r\n") + "\r\n";
}
