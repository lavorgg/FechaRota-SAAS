// Apoio às páginas do servidor.

import "server-only";

import { notFound } from "next/navigation";

import { ServiceError } from "./errors";

/** Registro de outra empresa ou inexistente vira a página 404 (seção 3.4: 404, não 403). */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NAO_ENCONTRADO") notFound();
    throw error;
  }
}
