"use server";

import { revalidatePath } from "next/cache";

import { runAction, type ActionResult } from "@/lib/actions/run-action";
import { type VehicleDTO, createVehicle, deleteVehicle, setVehicleActive, updateVehicle } from "@/lib/services/vehicles";
import { deleteSchema, setActiveSchema, updateVehicleSchema, vehicleSchema } from "@/lib/validation/catalog";

const PATH = "/app/veiculos";

export async function createVehicleAction(input: unknown): Promise<ActionResult<VehicleDTO>> {
  return runAction("veiculo-criar", input, { schema: vehicleSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const vehicle = await createVehicle(ctx, data);
    revalidatePath(PATH);
    return vehicle;
  });
}

export async function updateVehicleAction(input: unknown): Promise<ActionResult<VehicleDTO>> {
  return runAction("veiculo-editar", input, { schema: updateVehicleSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const vehicle = await updateVehicle(ctx, data);
    revalidatePath(PATH);
    return vehicle;
  });
}

export async function setVehicleActiveAction(input: unknown): Promise<ActionResult<VehicleDTO>> {
  return runAction("veiculo-ativo", input, { schema: setActiveSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const vehicle = await setVehicleActive(ctx, data.id, data.active);
    revalidatePath(PATH);
    return vehicle;
  });
}

export async function deleteVehicleAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("veiculo-excluir", input, { schema: deleteSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    await deleteVehicle(ctx, data.id);
    revalidatePath(PATH);
    return null;
  });
}
