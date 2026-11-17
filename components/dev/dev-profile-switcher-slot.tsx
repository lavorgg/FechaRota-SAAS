import { impersonationTargetsFor } from "@/lib/auth/dev-switcher";
import type { AuthSession } from "@/lib/auth/sessions";

import { DevProfileSwitcher } from "./profile-switcher";

/** Renderiza a troca de perfil só quando ela está habilitada (desenvolvimento). */
export async function DevProfileSwitcherSlot({ session }: { session: AuthSession }) {
  const targets = await impersonationTargetsFor(session);
  if (!targets) return null;
  return <DevProfileSwitcher targets={targets} currentUserId={session.user.id} />;
}
