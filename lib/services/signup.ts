// Cadastro de nova empresa (seção 5.1): empresa em TRIAL por 14 dias + usuário ADMIN.

import "server-only";

import { hashPassword } from "../auth/password";
import { TRIAL_DAYS } from "../auth/plan";
import { COUNTER_KEYS } from "../counters";
import { prisma } from "../db";
import { ServiceError, prismaErrorCode } from "../errors";
import type { SignupData } from "../validation/auth";

export const EMAIL_IN_USE = "Este e-mail já está em uso.";

export async function signupCompany(data: SignupData, now: Date = new Date()): Promise<{ userId: string; companyId: string }> {
  const passwordHash = await hashPassword(data.password);
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  try {
    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: data.companyName,
          cnpj: data.cnpj,
          timezone: data.timezone,
          planStatus: "TRIAL",
          trialEndsAt,
          counters: { create: [{ key: COUNTER_KEYS.order }, { key: COUNTER_KEYS.route }] },
        },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: { companyId: company.id, name: data.adminName, email: data.email, passwordHash, role: "ADMIN" },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: user.id,
          entity: "Company",
          entityId: company.id,
          action: "EMPRESA_CADASTRADA",
          after: { name: data.companyName, planStatus: "TRIAL", trialEndsAt: trialEndsAt.toISOString() },
        },
      });
      return { userId: user.id, companyId: company.id };
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      throw new ServiceError("CONFLITO", EMAIL_IN_USE, { email: EMAIL_IN_USE });
    }
    throw error;
  }
}
