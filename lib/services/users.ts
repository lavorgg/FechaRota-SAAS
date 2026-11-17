// Gestão de usuários (seção 5.1). Somente ADMIN.
//
// Regras (decisões do dono do produto e de segurança, ver CLAUDE.md):
// - ADMIN cria e promove qualquer papel, inclusive ADMIN.
// - A empresa nunca fica sem ADMIN ativo: não dá para rebaixar nem desativar o último.
// - Ninguém muda o próprio papel nem desativa o próprio usuário (evita se trancar fora).
// - Troca de papel, desativação e nova senha encerram as sessões do usuário afetado.
// - Toda alteração vai para a auditoria (seção 3.11); senha nunca entra no registro.

import "server-only";

import { type ServiceContext, assertCan, assertCanWrite } from "../auth/context";
import { hashPassword } from "../auth/password";
import type { UserRole } from "../auth/permissions";
import { deleteSessionsOfUser } from "../auth/sessions";
import { MESSAGES, ServiceError, notFound, prismaErrorCode } from "../errors";
import { getTenantDb } from "../tenant-db";
import type { CreateUserData, ResetPasswordData, SetUserActiveData, UpdateUserData } from "../validation/users";
import { EMAIL_IN_USE } from "./signup";

export const USERS_PAGE_SIZE = 20;

export const USER_MESSAGES = {
  lastAdmin: "A empresa precisa de pelo menos um administrador ativo.",
  ownRole: "Você não pode mudar o próprio papel.",
  ownDeactivation: "Você não pode desativar o próprio usuário.",
} as const;

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
};

const userSelect = { id: true, name: true, email: true, phone: true, role: true, active: true, createdAt: true } as const;

function toUserDTO(user: { id: string; name: string; email: string; phone: string | null; role: UserRole; active: boolean; createdAt: Date }): UserDTO {
  return { ...user, createdAt: user.createdAt.toISOString() };
}

function rethrowKnown(error: unknown): never {
  const code = prismaErrorCode(error);
  if (code === "P2002") throw new ServiceError("CONFLITO", EMAIL_IN_USE, { email: EMAIL_IN_USE });
  if (code === "P2034") throw new ServiceError("CONFLITO", MESSAGES.concurrentChange);
  throw error;
}

export async function listUsers(
  ctx: ServiceContext,
  params: { q?: string | undefined; page: number },
): Promise<{ items: UserDTO[]; total: number; page: number; pageCount: number }> {
  assertCan(ctx, "usuarios.gerenciar");
  const db = getTenantDb(ctx);
  const where = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: "insensitive" as const } },
          { email: { contains: params.q.toLowerCase() } },
        ],
      }
    : {};

  const total = await db.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const rows = await db.user.findMany({
    where,
    select: userSelect,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    skip: (page - 1) * USERS_PAGE_SIZE,
    take: USERS_PAGE_SIZE,
  });
  return { items: rows.map(toUserDTO), total, page, pageCount };
}

export async function createUser(ctx: ServiceContext, data: CreateUserData): Promise<UserDTO> {
  assertCan(ctx, "usuarios.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const passwordHash = await hashPassword(data.password);

  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { companyId: ctx.companyId, name: data.name, email: data.email, phone: data.phone, role: data.role, passwordHash },
        select: userSelect,
      });
      await tx.auditLog.create({
        data: {
          companyId: ctx.companyId,
          userId: ctx.userId,
          entity: "User",
          entityId: user.id,
          action: "USUARIO_CRIADO",
          after: { name: user.name, email: user.email, role: user.role },
        },
      });
      return toUserDTO(user);
    });
  } catch (error) {
    rethrowKnown(error);
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof getTenantDb>["$transaction"]>[0]>[0];

/** Garante que, sem o usuário `exceptUserId`, ainda sobra outro ADMIN ativo. */
async function assertAnotherActiveAdmin(tx: Tx, exceptUserId: string): Promise<void> {
  const others = await tx.user.count({ where: { role: "ADMIN", active: true, id: { not: exceptUserId } } });
  if (others === 0) {
    throw new ServiceError("VALIDACAO", USER_MESSAGES.lastAdmin);
  }
}

export async function updateUser(ctx: ServiceContext, data: UpdateUserData): Promise<UserDTO> {
  assertCan(ctx, "usuarios.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);

  let roleChanged = false;
  let updated: UserDTO;
  try {
    // Serializable: duas pessoas rebaixando os dois últimos ADMIN ao mesmo tempo não passam juntas.
    updated = await db.$transaction(
      async (tx) => {
        const current = await tx.user.findUnique({ where: { id: data.id }, select: userSelect });
        if (!current) throw notFound();

        roleChanged = current.role !== data.role;
        if (roleChanged && current.id === ctx.userId) {
          throw new ServiceError("VALIDACAO", USER_MESSAGES.ownRole, { role: USER_MESSAGES.ownRole });
        }
        if (roleChanged && current.role === "ADMIN" && current.active) {
          await assertAnotherActiveAdmin(tx, current.id);
        }

        const user = await tx.user.update({
          where: { id: current.id },
          data: { name: data.name, email: data.email, phone: data.phone, role: data.role },
          select: userSelect,
        });

        const before: Record<string, string | null> = {};
        const after: Record<string, string | null> = {};
        for (const field of ["name", "email", "phone", "role"] as const) {
          if (current[field] !== user[field]) {
            before[field] = current[field];
            after[field] = user[field];
          }
        }
        if (Object.keys(after).length > 0) {
          await tx.auditLog.create({
            data: {
              companyId: ctx.companyId,
              userId: ctx.userId,
              entity: "User",
              entityId: user.id,
              action: roleChanged ? "USUARIO_PAPEL_ALTERADO" : "USUARIO_ALTERADO",
              before,
              after,
            },
          });
        }
        return toUserDTO(user);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowKnown(error);
  }

  if (roleChanged) await deleteSessionsOfUser(updated.id);
  return updated;
}

export async function setUserActive(ctx: ServiceContext, data: SetUserActiveData): Promise<UserDTO> {
  assertCan(ctx, "usuarios.gerenciar");
  assertCanWrite(ctx);
  if (data.id === ctx.userId && !data.active) {
    throw new ServiceError("VALIDACAO", USER_MESSAGES.ownDeactivation);
  }
  const db = getTenantDb(ctx);

  let changed = false;
  let updated: UserDTO;
  try {
    updated = await db.$transaction(
      async (tx) => {
        const current = await tx.user.findUnique({ where: { id: data.id }, select: userSelect });
        if (!current) throw notFound();
        if (current.active === data.active) return toUserDTO(current);

        if (!data.active && current.role === "ADMIN") {
          await assertAnotherActiveAdmin(tx, current.id);
        }
        const user = await tx.user.update({ where: { id: current.id }, data: { active: data.active }, select: userSelect });
        await tx.auditLog.create({
          data: {
            companyId: ctx.companyId,
            userId: ctx.userId,
            entity: "User",
            entityId: user.id,
            action: data.active ? "USUARIO_REATIVADO" : "USUARIO_DESATIVADO",
            before: { active: current.active },
            after: { active: user.active },
          },
        });
        changed = true;
        return toUserDTO(user);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowKnown(error);
  }

  if (changed && !updated.active) await deleteSessionsOfUser(updated.id);
  return updated;
}

/** Nova senha definida pelo ADMIN. Encerra todas as sessões do usuário, inclusive a do próprio ADMIN se for ele. */
export async function resetUserPassword(ctx: ServiceContext, data: ResetPasswordData): Promise<void> {
  assertCan(ctx, "usuarios.gerenciar");
  assertCanWrite(ctx);
  const db = getTenantDb(ctx);
  const passwordHash = await hashPassword(data.password);

  await db.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: data.id }, select: { id: true } });
    if (!current) throw notFound();
    await tx.user.update({ where: { id: current.id }, data: { passwordHash } });
    await tx.auditLog.create({
      data: { companyId: ctx.companyId, userId: ctx.userId, entity: "User", entityId: current.id, action: "USUARIO_SENHA_REDEFINIDA" },
    });
  });
  await deleteSessionsOfUser(data.id);
}
