// Chaves de arquivo no storage (seção 3.4): sempre "companies/{companyId}/...".
// Módulo puro, sem dependência do SDK, para ser testado isoladamente.

import { randomUUID } from "node:crypto";

export class StorageKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageKeyError";
  }
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const SAFE_KEY = /^[A-Za-z0-9_\-./]+$/;

export const ALLOWED_UPLOAD_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;
export type AllowedUploadType = keyof typeof ALLOWED_UPLOAD_TYPES;

export function isAllowedUploadType(value: string): value is AllowedUploadType {
  return Object.hasOwn(ALLOWED_UPLOAD_TYPES, value);
}

/** Tamanho máximo de cada foto ou assinatura (seção 5.7). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new StorageKeyError(`${label} inválido para compor chave de arquivo.`);
  }
}

export function companyPrefix(companyId: string): string {
  assertSafeSegment(companyId, "companyId");
  return `companies/${companyId}/`;
}

/** Chave nova e não adivinhável para foto ou assinatura de um comprovante de entrega. */
export function buildProofFileKey(params: { companyId: string; orderId: string; contentType: AllowedUploadType }): string {
  assertSafeSegment(params.orderId, "orderId");
  const extension = ALLOWED_UPLOAD_TYPES[params.contentType];
  return `${companyPrefix(params.companyId)}proofs/${params.orderId}/${randomUUID()}.${extension}`;
}

/** Verdadeiro somente se a chave é bem formada e está dentro do prefixo da empresa. */
export function isKeyOfCompany(key: string, companyId: string): boolean {
  if (!SAFE_SEGMENT.test(companyId)) return false;
  if (!SAFE_KEY.test(key)) return false;
  if (key.includes("..") || key.includes("//")) return false;
  return key.startsWith(`companies/${companyId}/`) && key.length > `companies/${companyId}/`.length;
}

/** Toda operação de storage chama isto antes de tocar no objeto. */
export function assertKeyOfCompany(key: string, companyId: string): void {
  if (!isKeyOfCompany(key, companyId)) {
    throw new StorageKeyError("Arquivo não pertence a esta empresa.");
  }
}
