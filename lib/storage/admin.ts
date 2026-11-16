// Upload feito PELO SERVIDOR. Uso exclusivo de scripts (seed) e testes.
// O app nunca importa este arquivo (o ESLint bloqueia em app/): na aplicação, fotos e
// assinaturas sobem direto do navegador com createUploadUrl() (seção 3.12).

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { s3, storageBucket } from "./client";
import { type AllowedUploadType, assertKeyOfCompany } from "./keys";

export async function putObjectFromScript(params: {
  companyId: string;
  key: string;
  body: Uint8Array;
  contentType: AllowedUploadType;
}): Promise<void> {
  assertKeyOfCompany(params.key, params.companyId);
  await s3.send(
    new PutObjectCommand({
      Bucket: storageBucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ContentLength: params.body.byteLength,
    }),
  );
}
