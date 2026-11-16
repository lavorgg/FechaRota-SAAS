// Cliente S3 único para os dois ambientes: RustFS (local) e Cloudflare R2 (Vercel).
// O código é o mesmo; só mudam as variáveis S3_* (ver .env.example).

import { S3Client } from "@aws-sdk/client-s3";

import { env } from "../env";

function createS3Client(): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // O SDK passou a enviar checksum CRC32 em todo upload. O R2 e outros compatíveis com S3
    // não aceitam isso em URL pré-assinada, e o navegador não saberia calcular o cabeçalho.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

const globalForS3 = globalThis as typeof globalThis & { __fecharotaS3?: S3Client };

export const s3: S3Client = globalForS3.__fecharotaS3 ?? createS3Client();

if (env.NODE_ENV !== "production") {
  globalForS3.__fecharotaS3 = s3;
}

export const storageBucket: string = env.S3_BUCKET;
