"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, runAction } from "@/lib/actions/run-action";
import {
  type SavedRoute,
  addOrdersToRoute,
  createRoute,
  deleteDraftRoute,
  releaseRoute,
  removeOrderFromRoute,
  reopenRoute,
  reorderRouteStops,
  updateRoute,
} from "@/lib/services/routes";
import { createRouteSchema, removeRouteOrderSchema, reopenRouteSchema, routeOrdersSchema, routeVersionSchema, updateRouteSchema } from "@/lib/validation/routes";

function refresh() {
  // "layout" inclui o detalhe da rota e os romaneios.
  revalidatePath("/app/rotas", "layout");
  revalidatePath("/app/pedidos");
  revalidatePath("/app/dashboard");
}

export async function createRouteAction(input: unknown): Promise<ActionResult<SavedRoute>> {
  return runAction("rota-criar", input, { schema: createRouteSchema, permission: "rotas.montar" }, async (ctx, data) => {
    const route = await createRoute(ctx, data);
    refresh();
    return route;
  });
}

export async function updateRouteAction(input: unknown): Promise<ActionResult<SavedRoute>> {
  return runAction("rota-editar", input, { schema: updateRouteSchema, permission: "rotas.montar" }, async (ctx, data) => {
    const route = await updateRoute(ctx, data);
    refresh();
    return route;
  });
}

export async function addOrdersToRouteAction(input: unknown): Promise<ActionResult<SavedRoute>> {
  return runAction("rota-adicionar-pedidos", input, { schema: routeOrdersSchema, permission: "rotas.montar" }, async (ctx, data) => {
    const route = await addOrdersToRoute(ctx, data);
    refresh();
    return route;
  });
}

export async function removeOrderFromRouteAction(input: unknown): Promise<ActionResult<SavedRoute>> {
  return runAction("rota-remover-pedido", input, { schema: removeRouteOrderSchema, permission: "rotas.montar" }, async (ctx, data) => {
    const route = await removeOrderFromRoute(ctx, data);
    refresh();
    return route;
  });
}

export async function reorderRouteStopsAction(input: unknown): Promise<ActionResult<SavedRoute>> {
  return runAction("rota-reordenar", input, { schema: routeOrdersSchema, permission: "rotas.montar" }, async (ctx, data) => {
    const route = await reorderRouteStops(ctx, data);
    refresh();
    return route;
  });
}

export async function releaseRouteAction(input: unknown): Promise<ActionResult<SavedRoute>> {
  return runAction("rota-liberar", input, { schema: routeVersionSchema, permission: "rotas.montar" }, async (ctx, data) => {
    const route = await releaseRoute(ctx, data);
    refresh();
    return route;
  });
}

export async function reopenRouteAction(input: unknown): Promise<ActionResult<SavedRoute>> {
  return runAction("rota-reabrir", input, { schema: reopenRouteSchema, permission: "rotas.reabrir" }, async (ctx, data) => {
    const route = await reopenRoute(ctx, data);
    refresh();
    return route;
  });
}

export async function deleteRouteAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("rota-excluir", input, { schema: routeVersionSchema, permission: "rotas.montar" }, async (ctx, data) => {
    await deleteDraftRoute(ctx, data);
    refresh();
    return null;
  });
}
