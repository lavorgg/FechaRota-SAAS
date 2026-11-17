"use client";

import { Building2Icon, CarFrontIcon, ClipboardListIcon, LayoutDashboardIcon, PackageIcon, RouteIcon, StoreIcon, TruckIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { DATE_PARAM } from "@/lib/selected-date";

import type { NavIcon, NavItem } from "./nav";

const ICONS: Record<NavIcon, typeof LayoutDashboardIcon> = {
  dashboard: LayoutDashboardIcon,
  pedidos: ClipboardListIcon,
  rotas: RouteIcon,
  clientes: StoreIcon,
  produtos: PackageIcon,
  veiculos: CarFrontIcon,
  usuarios: UsersIcon,
  empresa: Building2Icon,
};

type Items = ReadonlyArray<Omit<NavItem, "permission">>;

// Só a lista de links lê a data da URL (useSearchParams), então só ela fica dentro do
// Suspense. O <Sidebar> fica de fora: ele troca de forma no celular (Sheet) e precisa hidratar
// junto com o SidebarProvider; dentro de uma fronteira que hidrata depois, o HTML do servidor
// não batia com o cliente.
export function PanelSidebar({ items, companyName }: { items: Items; companyName: string }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/app/dashboard">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <TruckIcon className="size-4" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-semibold">FechaRota</span>
                  <span className="truncate text-xs text-muted-foreground">{companyName}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Suspense fallback={<PanelNav items={items} date={null} />}>
              <PanelNavWithDate items={items} />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function PanelNavWithDate({ items }: { items: Items }) {
  return <PanelNav items={items} date={useSearchParams().get(DATE_PARAM)} />;
}

function PanelNav({ items, date }: { items: Items; date: string | null }) {
  const pathname = usePathname();
  return (
    <SidebarMenu aria-label="Menu principal">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const href = item.usesDate && date ? `${item.href}?${DATE_PARAM}=${date}` : item.href;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
              <Link href={href} aria-current={active ? "page" : undefined}>
                <Icon aria-hidden />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
