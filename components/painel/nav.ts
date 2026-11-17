// Itens do menu do painel. Cada um aparece só para quem tem a permissão (seção 5.1).
// Entram aqui apenas telas que já existem.

import type { Permission } from "@/lib/auth/permissions";

export type NavIcon = "dashboard" | "pedidos" | "clientes" | "produtos" | "veiculos" | "usuarios";

export type NavItem = { href: string; label: string; icon: NavIcon; permission: Permission; usesDate: boolean };

export const PANEL_NAV: readonly NavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: "dashboard", permission: "painel.acessar", usesDate: true },
  { href: "/app/pedidos", label: "Pedidos", icon: "pedidos", permission: "pedidos.gerenciar", usesDate: true },
  { href: "/app/clientes", label: "Clientes", icon: "clientes", permission: "cadastros.gerenciar", usesDate: false },
  { href: "/app/produtos", label: "Produtos", icon: "produtos", permission: "cadastros.gerenciar", usesDate: false },
  { href: "/app/veiculos", label: "Veículos", icon: "veiculos", permission: "cadastros.gerenciar", usesDate: false },
  { href: "/app/usuarios", label: "Usuários", icon: "usuarios", permission: "usuarios.gerenciar", usesDate: false },
];
