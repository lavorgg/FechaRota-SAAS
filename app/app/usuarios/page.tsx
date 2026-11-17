import type { Metadata } from "next";

import { UsersManager } from "@/components/usuarios/users-manager";
import { requirePagePermission, serviceContext } from "@/lib/auth/current";
import { planAllowsWrite } from "@/lib/auth/plan";
import { listUsers } from "@/lib/services/users";
import { listUsersSchema } from "@/lib/validation/users";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage({ searchParams }: PageProps<"/app/usuarios">) {
  const session = await requirePagePermission("usuarios.gerenciar");
  const params = await searchParams;
  const query = listUsersSchema.parse({
    q: Array.isArray(params.q) ? params.q[0] : params.q,
    page: Array.isArray(params.pagina) ? params.pagina[0] : params.pagina,
  });
  const result = await listUsers(serviceContext(session), query);

  return (
    <UsersManager
      users={result.items}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      query={query.q ?? ""}
      currentUserId={session.user.id}
      readOnly={!planAllowsWrite(session.company.planStatus)}
    />
  );
}
