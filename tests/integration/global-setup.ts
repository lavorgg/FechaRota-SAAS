// Roda uma vez antes dos testes de integração: recria o schema do banco de teste e aplica as
// migrations reais (as mesmas que vão para produção).

import { spawnSync } from "node:child_process";

import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Client } from "pg";

import { loadTestEnv } from "./load-test-env";

const HELP = "Suba os serviços locais com `docker compose up -d` e tente de novo.";

export default async function setup(): Promise<void> {
  loadTestEnv();

  const client = new Client({ connectionString: process.env.DIRECT_URL });
  try {
    await client.connect();
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } catch {
    throw new Error(`Não foi possível conectar ao Postgres de teste (porta 5433). ${HELP}`);
  } finally {
    await client.end().catch(() => undefined);
  }

  const migrate = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { env: process.env, encoding: "utf8" });
  if (migrate.status !== 0) {
    throw new Error(`prisma migrate deploy falhou no banco de teste:\n${migrate.stdout}\n${migrate.stderr}`);
  }

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
  } catch {
    throw new Error(`Não foi possível acessar o bucket de teste "${process.env.S3_BUCKET}". ${HELP}`);
  } finally {
    s3.destroy();
  }
}
