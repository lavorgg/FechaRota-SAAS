import { Suspense } from "react";

import { DevProfileSwitcherSlot } from "@/components/dev/dev-profile-switcher-slot";
import { DateSelector } from "@/components/painel/date-selector";
import { PANEL_NAV } from "@/components/painel/nav";
import { PanelSidebar } from "@/components/painel/panel-sidebar";
import { ReadOnlyBanner } from "@/components/painel/read-only-banner";
import { UserMenu } from "@/components/painel/user-menu";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { todayInTimeZone } from "@/domain/dates";
import { requireArea } from "@/lib/auth/current";
import { ROLE_LABELS, can } from "@/lib/auth/permissions";
import { planAllowsWrite } from "@/lib/auth/plan";

// Painel administrativo (seção 5.2). Cada página confere a própria permissão de novo:
// o layout não é re-executado em toda navegação e não serve como única barreira.
export default async function PanelLayout({ children }: LayoutProps<"/app">) {
  const session = await requireArea("painel.acessar");
  const { user, company } = session;
  const items = PANEL_NAV.filter((item) => can(user.role, item.permission)).map(({ href, label, icon, usesDate }) => ({ href, label, icon, usesDate }));
  const today = todayInTimeZone(company.timezone);

  return (
    <SidebarProvider>
      <PanelSidebar items={items} companyName={company.name} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 min-w-0 shrink-0 items-center gap-1 border-b bg-background px-2 sm:gap-2 sm:px-3 print:hidden">
          <SidebarTrigger aria-label="Recolher ou abrir o menu" />
          <div aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <Suspense>
            <DateSelector today={today} />
          </Suspense>
          <div className="ml-auto shrink-0">
            <UserMenu name={user.name} email={user.email} roleLabel={ROLE_LABELS[user.role]} />
          </div>
        </header>
        {!planAllowsWrite(company.planStatus) && <ReadOnlyBanner />}
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 print:p-0">{children}</div>
      </SidebarInset>
      <DevProfileSwitcherSlot session={session} />
    </SidebarProvider>
  );
}
