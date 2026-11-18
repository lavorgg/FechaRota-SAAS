import { DriverApp } from "@/components/motorista/app/driver-app";
import { requirePagePermission } from "@/lib/auth/current";

// A página não carrega dado nenhum no servidor: o app busca na API ou lê do IndexedDB.
export default async function DriverHomePage() {
  await requirePagePermission("entregas.registrar");
  return <DriverApp />;
}
