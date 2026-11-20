// `pnpm storage:cors`: libera CORS no bucket de UM ambiente (seção 5.7, "Bucket R2"): PUT (fotos
// e assinaturas enviadas direto do celular) e GET (comprovantes no acerto), só para as origens
// do app. Rode uma vez por bucket (produção e preview), com as credenciais daquele ambiente:
//
//   S3_ENDPOINT=... S3_REGION=auto S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
//   S3_BUCKET=... S3_FORCE_PATH_STYLE=false CORS_ORIGINS="https://app.exemplo.com.br" pnpm storage:cors

import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name}.`);
  return value;
}

/** Só https (ou localhost em http): origem com caminho, curinga ou http público é recusada. */
export function parseOrigins(raw: string): string[] {
  const origins = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error("CORS_ORIGINS vazia.");
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Origem inválida: ${origin}`);
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.origin !== origin || origin.includes("*") || (url.protocol !== "https:" && !local)) {
      throw new Error(`Origem não aceita: ${origin}. Use só esquema e domínio, com https (ex.: https://app.exemplo.com.br).`);
    }
  }
  return origins;
}

async function main(): Promise<void> {
  const origins = parseOrigins(required("CORS_ORIGINS"));
  const bucket = required("S3_BUCKET");
  const s3 = new S3Client({
    endpoint: required("S3_ENDPOINT"),
    region: required("S3_REGION"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: required("S3_ACCESS_KEY_ID"), secretAccessKey: required("S3_SECRET_ACCESS_KEY") },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT", "GET"], AllowedHeaders: ["content-type"], MaxAgeSeconds: 3600 }] },
    }),
  );
  const applied = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log(`CORS do bucket "${bucket}" aplicado para: ${(applied.CORSRules?.[0]?.AllowedOrigins ?? []).join(", ")}`);
  s3.destroy();
}

if (process.argv[1]?.endsWith("storage-cors.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `Falha: ${error.message}` : error);
    process.exitCode = 1;
  });
}
