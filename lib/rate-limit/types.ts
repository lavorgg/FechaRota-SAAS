export type RateLimitResult = {
  success: boolean;
  /** Instante (ms desde 1970) em que a próxima tentativa volta a ser aceita. */
  resetAt: number;
};

export interface RateLimiter {
  /** Conta uma tentativa para a chave e diz se ela pode seguir. */
  limit(key: string): Promise<RateLimitResult>;
  /** Zera as tentativas da chave (ex.: depois de um login certo). */
  reset(key: string): Promise<void>;
}

export type RateLimitRule = {
  /** Nome curto, usado no prefixo das chaves. */
  name: string;
  max: number;
  windowMs: number;
};
