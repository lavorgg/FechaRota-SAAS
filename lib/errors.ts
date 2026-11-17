// Erros de regra de negócio, com mensagem em português pronta para o usuário final.
// Qualquer outro erro (Prisma, rede, bug) vira uma mensagem genérica na borda e nunca
// chega à tela com detalhes internos (seção 0, regra 6).

export type ServiceErrorCode = "NAO_ENCONTRADO" | "SEM_PERMISSAO" | "SOMENTE_LEITURA" | "CONFLITO" | "VALIDACAO";

export type FieldErrors = Record<string, string>;

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export const MESSAGES = {
  notFound: "Registro não encontrado.",
  forbidden: "Você não tem permissão para esta ação.",
  readOnly: "Sua conta está com pagamento pendente. O painel está disponível só para consulta.",
  sessionExpired: "Sua sessão expirou. Entre novamente.",
  unexpected: "Não foi possível concluir a operação. Tente novamente.",
  concurrentChange: "Outra pessoa alterou estes dados ao mesmo tempo. Recarregue a página e tente de novo.",
} as const;

export function notFound(): ServiceError {
  return new ServiceError("NAO_ENCONTRADO", MESSAGES.notFound);
}

/** Código de erro do Prisma (P2002 = unicidade, P2025 = não encontrado, P2034 = conflito de transação). */
export function prismaErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/** Campos da restrição de unicidade violada (P2002), quando o Prisma informa. */
export function uniqueViolationFields(error: unknown): string[] {
  if (prismaErrorCode(error) !== "P2002") return [];
  const meta = (error as { meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } } } }).meta;
  const target = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(target)) return target.filter((field): field is string => typeof field === "string");
  if (typeof target === "string") return [target];
  return [];
}
