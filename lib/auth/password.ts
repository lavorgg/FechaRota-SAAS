// Hash de senha (seção 5.1): bcrypt com custo 12.

import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

// O bcrypt ignora tudo depois de 72 bytes. Limitar evita duas senhas longas "iguais".
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new Error("A senha é longa demais.");
  }
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return false;
  return bcrypt.compare(password, passwordHash);
}
