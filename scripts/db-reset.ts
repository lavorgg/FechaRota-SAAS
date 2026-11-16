// `pnpm db:reset`: apaga TUDO do banco e do bucket LOCAIS, reaplica as migrations e roda o seed.
//
// Trava de segurança: só roda contra localhost. Não existe opção para forçar. Para um banco
// remoto (preview), use `pnpm db:deploy` + `pnpm db:seed` sobre um banco vazio.

import "dotenv/config";

import { spawnSync } from "node:child_process";

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { Client } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function requireLocalUrl(name: string): URL {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não está definida. Copie o .env.example para .env.`);
  const url = new URL(value);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${name} aponta para "${url.hostname}". O db:reset só roda contra localhost.`);
  }
  return url;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    throw new Error(`"${command} ${args.join(" ")}" falhou.`);
  }
}

async function resetDatabase(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
}

async function emptyBucket(): Promise<number> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET não está definida.");
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "companies/", ContinuationToken: token }));
    const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
    if (keys.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  s3.destroy();
  return deleted;
}

async function main(): Promise<void> {
  if (process.env.VERCEL_ENV) {
    throw new Error("O db:reset não roda dentro da Vercel.");
  }
  const directUrl = requireLocalUrl("DIRECT_URL");
  requireLocalUrl("DATABASE_URL");
  requireLocalUrl("S3_ENDPOINT");

  console.log(`Recriando o banco local "${directUrl.pathname.slice(1)}"...`);
  await resetDatabase(directUrl.toString());

  const deleted = await emptyBucket();
  console.log(`Bucket local "${process.env.S3_BUCKET}" esvaziado (${deleted} arquivo(s)).`);

  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  run("pnpm", ["exec", "prisma", "db", "seed"]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `\nFalha no db:reset: ${error.message}` : error);
  process.exitCode = 1;
});
