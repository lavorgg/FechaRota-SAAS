// Storage S3 (seções 3.4, 3.12 e 5.7) contra o servidor S3 local, com o mesmo código do R2.
// O "navegador" aqui é o fetch: ele só conhece a URL pré-assinada, nunca as credenciais.

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { checkHealth } from "@/lib/health";
import { DOWNLOAD_URL_TTL_SECONDS, UPLOAD_URL_TTL_SECONDS, createDownloadUrl, createUploadUrl, deleteObjects, pingStorage, statObject } from "@/lib/storage";
import { putObjectFromScript } from "@/lib/storage/admin";
import { MAX_UPLOAD_BYTES, StorageKeyError, buildProofFileKey } from "@/lib/storage/keys";
import { sampleSignaturePng } from "@/prisma/seed-support/png";

const A = `empresaA${randomUUID().replaceAll("-", "")}`;
const B = `empresaB${randomUUID().replaceAll("-", "")}`;
const png = sampleSignaturePng(1);

function newKey(companyId: string, contentType: "image/png" | "image/jpeg" = "image/png"): string {
  return buildProofFileKey({ companyId, orderId: "pedido1", contentType });
}

async function browserPut(url: string, body: Uint8Array, contentType: string): Promise<Response> {
  return fetch(url, { method: "PUT", body: new Blob([new Uint8Array(body)]), headers: { "Content-Type": contentType } });
}

describe("upload direto com URL pré-assinada", () => {
  it("o navegador envia o arquivo direto ao storage e o servidor confere tamanho e tipo", async () => {
    const key = newKey(A);
    const upload = await createUploadUrl({ companyId: A, key, contentType: "image/png", sizeBytes: png.byteLength });

    expect(upload.expiresInSeconds).toBe(UPLOAD_URL_TTL_SECONDS);
    expect(upload.expiresInSeconds).toBe(600);
    expect(new URL(upload.url).searchParams.get("X-Amz-Expires")).toBe("600");
    expect(upload.headers).toEqual({ "Content-Type": "image/png" });

    const response = await browserPut(upload.url, png, "image/png");
    expect(response.status).toBe(200);
    expect(await statObject({ companyId: A, key })).toEqual({ sizeBytes: png.byteLength, contentType: "image/png" });
  });

  it("a URL não aceita outro tipo de arquivo", async () => {
    const key = newKey(A);
    const upload = await createUploadUrl({ companyId: A, key, contentType: "image/png", sizeBytes: png.byteLength });
    const response = await browserPut(upload.url, png, "text/html");
    expect(response.status).toBe(403);
    expect(await statObject({ companyId: A, key })).toBeNull();
  });

  it("a URL não aceita arquivo de outro tamanho", async () => {
    const key = newKey(A);
    const upload = await createUploadUrl({ companyId: A, key, contentType: "image/png", sizeBytes: png.byteLength });
    const bigger = new Uint8Array(png.byteLength + 1000);
    bigger.set(png);
    const response = await browserPut(upload.url, bigger, "image/png");
    expect(response.status).toBe(403);
    expect(await statObject({ companyId: A, key })).toBeNull();
  });

  it("a URL de uma chave não serve para gravar em outra chave", async () => {
    const key = newKey(A);
    const otherKey = newKey(B);
    const upload = await createUploadUrl({ companyId: A, key, contentType: "image/png", sizeBytes: png.byteLength });
    const tampered = upload.url.replace(encodeURI(key), encodeURI(otherKey));
    expect(tampered).not.toBe(upload.url);
    const response = await browserPut(tampered, png, "image/png");
    expect(response.status).toBe(403);
    expect(await statObject({ companyId: B, key: otherKey })).toBeNull();
  });

  it("recusa tipo e tamanho fora do permitido antes de assinar", async () => {
    const key = newKey(A);
    await expect(createUploadUrl({ companyId: A, key, contentType: "image/svg+xml" as never, sizeBytes: 100 })).rejects.toThrow(StorageKeyError);
    await expect(createUploadUrl({ companyId: A, key, contentType: "image/png", sizeBytes: MAX_UPLOAD_BYTES + 1 })).rejects.toThrow(StorageKeyError);
    await expect(createUploadUrl({ companyId: A, key, contentType: "image/png", sizeBytes: 0 })).rejects.toThrow(StorageKeyError);
    await expect(createUploadUrl({ companyId: A, key, contentType: "image/png", sizeBytes: 10.5 })).rejects.toThrow(StorageKeyError);
  });
});

describe("leitura com URL pré-assinada", () => {
  it("devolve o arquivo, com expiração de 5 minutos", async () => {
    const key = newKey(A);
    await putObjectFromScript({ companyId: A, key, body: png, contentType: "image/png" });

    const url = await createDownloadUrl({ companyId: A, key });
    expect(DOWNLOAD_URL_TTL_SECONDS).toBe(300);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("300");

    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  });

  it("o bucket é privado: sem assinatura não há leitura", async () => {
    const key = newKey(A);
    await putObjectFromScript({ companyId: A, key, body: png, contentType: "image/png" });
    const signed = new URL(await createDownloadUrl({ companyId: A, key }));
    const unsigned = `${signed.origin}${signed.pathname}`;
    expect((await fetch(unsigned)).status).toBe(403);
  });

  it("assinatura adulterada é recusada", async () => {
    const key = newKey(A);
    await putObjectFromScript({ companyId: A, key, body: png, contentType: "image/png" });
    const url = new URL(await createDownloadUrl({ companyId: A, key }));
    const signature = url.searchParams.get("X-Amz-Signature") ?? "";
    url.searchParams.set("X-Amz-Signature", signature.replace(/.$/, signature.endsWith("0") ? "1" : "0"));
    expect((await fetch(url)).status).toBe(403);
  });
});

describe("isolamento entre empresas no storage", () => {
  it("a empresa B não gera URL, não consulta e não apaga arquivo da A", async () => {
    const key = newKey(A);
    await putObjectFromScript({ companyId: A, key, body: png, contentType: "image/png" });

    await expect(createDownloadUrl({ companyId: B, key })).rejects.toThrow("Arquivo não pertence a esta empresa.");
    await expect(createUploadUrl({ companyId: B, key, contentType: "image/png", sizeBytes: png.byteLength })).rejects.toThrow(StorageKeyError);
    await expect(statObject({ companyId: B, key })).rejects.toThrow(StorageKeyError);
    await expect(deleteObjects({ companyId: B, keys: [key] })).rejects.toThrow(StorageKeyError);
    await expect(putObjectFromScript({ companyId: B, key, body: png, contentType: "image/png" })).rejects.toThrow(StorageKeyError);

    expect(await statObject({ companyId: A, key })).not.toBeNull();
  });

  it("uma única chave de outra empresa no lote impede o lote inteiro", async () => {
    const own = newKey(B);
    const foreign = newKey(A);
    await putObjectFromScript({ companyId: B, key: own, body: png, contentType: "image/png" });
    await putObjectFromScript({ companyId: A, key: foreign, body: png, contentType: "image/png" });

    await expect(deleteObjects({ companyId: B, keys: [own, foreign] })).rejects.toThrow(StorageKeyError);
    expect(await statObject({ companyId: B, key: own })).not.toBeNull();
    expect(await statObject({ companyId: A, key: foreign })).not.toBeNull();
  });

  it("chaves com travessia de diretório são recusadas", async () => {
    const hostile = `companies/${B}/../${A}/proofs/pedido1/x.png`;
    await expect(createDownloadUrl({ companyId: B, key: hostile })).rejects.toThrow(StorageKeyError);
    await expect(statObject({ companyId: B, key: hostile })).rejects.toThrow(StorageKeyError);
  });
});

describe("consulta e remoção", () => {
  it("statObject devolve null para arquivo que não existe", async () => {
    expect(await statObject({ companyId: A, key: newKey(A) })).toBeNull();
  });

  it("deleteObjects apaga os arquivos e é idempotente", async () => {
    const keys = [newKey(A), newKey(A, "image/jpeg")];
    for (const key of keys) {
      await putObjectFromScript({ companyId: A, key, body: png, contentType: "image/png" });
    }
    await deleteObjects({ companyId: A, keys });
    expect(await statObject({ companyId: A, key: keys[0] ?? "" })).toBeNull();
    expect(await statObject({ companyId: A, key: keys[1] ?? "" })).toBeNull();
    await expect(deleteObjects({ companyId: A, keys })).resolves.toBeUndefined();
    await expect(deleteObjects({ companyId: A, keys: [] })).resolves.toBeUndefined();
  });
});

describe("saúde", () => {
  it("pingStorage e checkHealth respondem ok com banco e storage no ar", async () => {
    await expect(pingStorage()).resolves.toBeUndefined();
    expect(await checkHealth()).toEqual({ status: "ok", checks: { database: "ok", storage: "ok" } });
  });
});
