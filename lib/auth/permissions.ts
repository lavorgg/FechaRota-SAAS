// Matriz de permissões (seção 5.1). ÚNICO lugar que decide o que cada papel pode fazer.
// Toda página, Server Action, Route Handler e serviço consulta daqui (seção 3.5).
//
// Decisões do dono do produto registradas em CLAUDE.md:
// - ADMIN pode criar e promover outros ADMIN.
// - Reabrir rota liberada é só do ADMIN (vale a matriz da 5.1, não a 3.8).

export const USER_ROLES = ["ADMIN", "EXPEDICAO", "MOTORISTA"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = {
  /** Entrar no painel administrativo (/app). */
  "painel.acessar": ["ADMIN", "EXPEDICAO"],
  /** Entrar na área do motorista (/motorista). */
  "motorista.acessar": ["ADMIN", "MOTORISTA"],
  /** Cadastros de clientes, produtos e veículos. */
  "cadastros.gerenciar": ["ADMIN", "EXPEDICAO"],
  /** Usuários e configurações da empresa. */
  "usuarios.gerenciar": ["ADMIN"],
  /** Criar e editar pedidos e gerar recorrência. */
  "pedidos.gerenciar": ["ADMIN", "EXPEDICAO"],
  /** Montar e liberar rota. */
  "rotas.montar": ["ADMIN", "EXPEDICAO"],
  /** Reabrir rota liberada para carga. */
  "rotas.reabrir": ["ADMIN"],
  /** Ver as próprias rotas e finalizar entregas. O MOTORISTA só nas rotas atribuídas a ele. */
  "entregas.registrar": ["ADMIN", "MOTORISTA"],
  /** Fechamento e acerto de rota. */
  "acerto.realizar": ["ADMIN", "EXPEDICAO"],
  /** Corrigir entrega já finalizada (com motivo). */
  "entregas.corrigir": ["ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

/**
 * "Ver suas rotas e finalizar entregas": o MOTORISTA só nas rotas atribuídas a ele. O ADMIN
 * vê e finaliza qualquer rota do dia (decisão do dono do produto).
 */
export function seesOnlyOwnRoutes(role: UserRole): boolean {
  return role === "MOTORISTA";
}

/** Para onde cada papel vai depois do login (e quando abre uma área que não é a dele). */
export function homePathFor(role: UserRole): "/app/dashboard" | "/motorista" {
  return can(role, "painel.acessar") ? "/app/dashboard" : "/motorista";
}

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: "Administrador",
  EXPEDICAO: "Expedição",
  MOTORISTA: "Motorista",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}
