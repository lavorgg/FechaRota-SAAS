"use server";

import { revalidatePath } from "next/cache";

import { runAction, type ActionResult } from "@/lib/actions/run-action";
import { importProducts } from "@/lib/services/imports";
import { type ProductDTO, createProduct, deleteProduct, setProductActive, updateProduct } from "@/lib/services/products";
import { deleteSchema, productSchema, setActiveSchema, updateProductSchema } from "@/lib/validation/catalog";
import { type ImportBatchResult, importBatchSchema } from "@/lib/validation/import";

const PATH = "/app/produtos";

export async function createProductAction(input: unknown): Promise<ActionResult<ProductDTO>> {
  return runAction("produto-criar", input, { schema: productSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const product = await createProduct(ctx, data);
    revalidatePath(PATH);
    return product;
  });
}

export async function updateProductAction(input: unknown): Promise<ActionResult<ProductDTO>> {
  return runAction("produto-editar", input, { schema: updateProductSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const product = await updateProduct(ctx, data);
    revalidatePath(PATH);
    return product;
  });
}

export async function setProductActiveAction(input: unknown): Promise<ActionResult<ProductDTO>> {
  return runAction("produto-ativo", input, { schema: setActiveSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const product = await setProductActive(ctx, data.id, data.active);
    revalidatePath(PATH);
    return product;
  });
}

export async function deleteProductAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("produto-excluir", input, { schema: deleteSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    await deleteProduct(ctx, data.id);
    revalidatePath(PATH);
    return null;
  });
}

export async function importProductsAction(input: unknown): Promise<ActionResult<ImportBatchResult>> {
  return runAction("produto-importar", input, { schema: importBatchSchema, permission: "cadastros.gerenciar" }, async (ctx, data) => {
    const result = await importProducts(ctx, data);
    revalidatePath(PATH);
    return result;
  });
}
