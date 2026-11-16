// Operações de arquivo usadas pelo app (seções 3.4, 3.12 e 5.7).
//
// Regras que este módulo garante:
// - nenhum arquivo passa pelas funções da Vercel: o navegador envia e baixa direto do storage,
//   com URL pré-assinada de curta duração;
// - toda função recebe o companyId da SESSÃO e recusa chave fora de "companies/{companyId}/".

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { s3, storageBucket } from "./client";
import { type AllowedUploadType, MAX_UPLOAD_BYTES, StorageKeyError, assertKeyOfCompany, isAllowedUploadType } from "./keys";

export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export type StoredObjectInfo = {
  sizeBytes: number;
  contentType: string | null;
};

/**
 * URL PUT pré-assinada para o navegador enviar UM arquivo direto ao storage.
 * O tipo e o tamanho entram na assinatura: enviar outro tipo ou outro tamanho é rejeitado
 * pelo storage. Mesmo assim, o servidor confere de novo com statObject() ao finalizar.
 */
export async function createUploadUrl(params: {
  companyId: string;
  key: string;
  contentType: AllowedUploadType;
  sizeBytes: number;
}): Promise<{ url: string; headers: Record<string, string>; expiresInSeconds: number }> {
  assertKeyOfCompany(params.key, params.companyId);
  if (!isAllowedUploadType(params.contentType)) {
    throw new StorageKeyError("Tipo de arquivo não permitido.");
  }
  if (!Number.isInteger(params.sizeBytes) || params.sizeBytes <= 0 || params.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new StorageKeyError("Tamanho de arquivo não permitido.");
  }

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: storageBucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.sizeBytes,
    }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );

  return {
    url,
    // O navegador precisa enviar exatamente este Content-Type (o Content-Length ele define sozinho).
    headers: { "Content-Type": params.contentType },
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  };
}

/** URL GET pré-assinada de curta duração. Chame só depois de conferir sessão e empresa. */
export async function createDownloadUrl(params: { companyId: string; key: string }): Promise<string> {
  assertKeyOfCompany(params.key, params.companyId);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: storageBucket, Key: params.key }), {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === "NotFound" || candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404;
}

/** Tamanho e tipo do objeto, ou null se ele não existe. */
export async function statObject(params: { companyId: string; key: string }): Promise<StoredObjectInfo | null> {
  assertKeyOfCompany(params.key, params.companyId);
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: storageBucket, Key: params.key }));
    return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Apaga objetos de UMA empresa (retenção e limpeza de uploads não confirmados). */
export async function deleteObjects(params: { companyId: string; keys: ReadonlyArray<string> }): Promise<void> {
  for (const key of params.keys) assertKeyOfCompany(key, params.companyId);
  // A API aceita no máximo 1000 chaves por chamada.
  for (let start = 0; start < params.keys.length; start += 1000) {
    const batch = params.keys.slice(start, start + 1000);
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: storageBucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (result.Errors && result.Errors.length > 0) {
      throw new Error(`Falha ao apagar ${result.Errors.length} arquivo(s) do storage.`);
    }
  }
}

/** Verifica se o bucket configurado existe e aceita as credenciais (usado no /api/health). */
export async function pingStorage(): Promise<void> {
  await s3.send(new HeadBucketCommand({ Bucket: storageBucket }));
}
