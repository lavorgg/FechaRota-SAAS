import { describe, expect, it } from "vitest";

import { buildCsv, decodeCsvBytes, detectDelimiter, mapColumns, normalizeHeader, parseCsv } from "./csv";

describe("decodeCsvBytes", () => {
  it("lê UTF-8 com e sem BOM", () => {
    const utf8 = new TextEncoder().encode("nome;cidade\nPão;Ribeirão");
    expect(decodeCsvBytes(utf8)).toBe("nome;cidade\nPão;Ribeirão");
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(decodeCsvBytes(withBom)).toBe("nome;cidade\nPão;Ribeirão");
  });

  it("lê Windows-1252 (Excel em português) quando não é UTF-8 válido", () => {
    // "Pão;Ribeirão" em Windows-1252: ã = 0xE3
    const bytes = new Uint8Array([0x50, 0xe3, 0x6f, 0x3b, 0x52, 0x69, 0x62, 0x65, 0x69, 0x72, 0xe3, 0x6f]);
    expect(decodeCsvBytes(bytes)).toBe("Pão;Ribeirão");
  });
});

describe("detectDelimiter", () => {
  it("prefere ; quando aparece mais na primeira linha", () => {
    expect(detectDelimiter("sku;nome;preco\nA;B;1,50")).toBe(";");
    expect(detectDelimiter("sku,nome,preco\nA,B,1.50")).toBe(",");
    expect(detectDelimiter('"a,b";c;d\n')).toBe(";");
  });
});

describe("parseCsv", () => {
  it("cabeçalho, registros e número da linha", () => {
    const parsed = parseCsv("sku;nome\r\nA1;Leite\r\n\r\nB2;Queijo\r\n");
    expect(parsed.header).toEqual(["sku", "nome"]);
    expect(parsed.records).toEqual([
      { line: 2, cells: ["A1", "Leite"] },
      { line: 4, cells: ["B2", "Queijo"] },
    ]);
  });

  it("aspas com separador, aspas dobradas e quebra de linha", () => {
    const parsed = parseCsv('nome;obs\n"Bar; do Zeca";"Diz ""oi""\nna porta"\nOutro;x');
    expect(parsed.records).toEqual([
      { line: 2, cells: ["Bar; do Zeca", 'Diz "oi"\nna porta'] },
      { line: 4, cells: ["Outro", "x"] },
    ]);
  });

  it("última linha sem quebra e células vazias", () => {
    expect(parseCsv("a;b;c\n1;;3").records).toEqual([{ line: 2, cells: ["1", "", "3"] }]);
  });

  it("arquivo vazio", () => {
    expect(parseCsv("")).toEqual({ header: [], records: [] });
  });
});

describe("mapColumns", () => {
  it("acha colunas pelo nome, em qualquer ordem e com acento", () => {
    const parsed = parseCsv("Nome;Razão Social;SKU\nX;Y;Z");
    const mapped = mapColumns(parsed, ["sku", "nome", "razao_social", "extra"] as const, ["sku", "nome"] as const);
    expect(mapped).toEqual({ ok: true, rows: [{ line: 2, values: { sku: "Z", nome: "X", razao_social: "Y", extra: "" } }] });
  });

  it("lista colunas obrigatórias ausentes", () => {
    const mapped = mapColumns(parseCsv("nome\nX"), ["sku", "nome", "preco"] as const, ["sku", "preco"] as const);
    expect(mapped).toEqual({ ok: false, error: "Colunas obrigatórias ausentes no cabeçalho: sku, preco." });
  });

  it("recusa arquivo sem dados", () => {
    expect(mapColumns(parseCsv("sku\n"), ["sku"] as const, ["sku"] as const)).toEqual({ ok: false, error: "O arquivo não tem nenhuma linha de dados." });
  });

  it("normalizeHeader", () => {
    expect(normalizeHeader(" Unidades por Vasilhame ")).toBe("unidades_por_vasilhame");
    expect(normalizeHeader("Preço (R$)")).toBe("preco_r");
  });
});

describe("buildCsv", () => {
  it("escapa o que precisa e ida e volta preserva", () => {
    const rows = [["nome", "obs"], ["Bar; do Zeca", 'Diz "oi"'], ["Simples", ""]];
    const text = buildCsv(rows);
    expect(text).toBe('nome;obs\r\n"Bar; do Zeca";"Diz ""oi"""\r\nSimples;\r\n');
    const parsed = parseCsv(text);
    expect([parsed.header, ...parsed.records.map((r) => r.cells)]).toEqual(rows);
  });
});
