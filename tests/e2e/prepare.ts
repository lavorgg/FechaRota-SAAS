// Preparo do E2E, rodado pelo comando do servidor do Playwright ANTES do build (o Playwright
// sobe o servidor antes do globalSetup, e o /api/health precisa do banco pronto).
// Cria (se faltar) o banco e o bucket do E2E e recria tudo do zero com migrations + seed
// (pnpm db:reset), usando somente as variáveis do .env.e2e.

import { spawnSync } from "node:child_process";

import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Client } from "pg";

import { e2eEnv } from "./env";

const HELP = "Suba os serviços locais com `docker compose up -d` e tente de novo.";

async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  if (!/^[a-z0-9_]+_e2e$/.test(name)) throw new Error(`Banco do E2E deve terminar em _e2e (recebido "${name}").`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch {
    throw new Error(`Não foi possível conectar ao Postgres de desenvolvimento. ${HELP}`);
  }
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

async function ensureBucket(env: Record<string, string>): Promise<void> {
  const bucket = env.S3_BUCKET ?? "";
  if (!bucket.endsWith("-e2e")) throw new Error(`Bucket do E2E deve terminar em -e2e (recebido "${bucket}").`);
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      throw new Error(`Não foi possível criar o bucket "${bucket}". ${HELP}`);
    }
  } finally {
    s3.destroy();
  }
}

async function prepare(): Promise<void> {
  const env = e2eEnv();
  await ensureDatabase(env.DIRECT_URL ?? "");
  await ensureBucket(env);

  const reset = spawnSync("pnpm", ["db:reset"], { env: { ...process.env, ...env, NODE_ENV: "development" }, encoding: "utf8" });
  if (reset.status !== 0) {
    throw new Error(`pnpm db:reset falhou para o E2E:\n${reset.stdout}\n${reset.stderr}`);
  }
}

prepare().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
