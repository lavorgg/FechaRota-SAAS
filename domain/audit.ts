// Registro de auditoria (seção 3.11) para leitura humana: nome de cada evento e as mudanças
// em "campo: antes → depois". Dado sensível nunca aparece (seção 6).

import { formatCents } from "./money";
import { ORDER_STATUS_LABELS } from "./order-status";
import { PAYMENT_STATUS_LABELS } from "./payment";
import { ROUTE_STATUS_LABELS } from "./route-status";

export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  EMPRESA_CADASTRADA: "Empresa cadastrada",
  EMPRESA_ALTERADA: "Dados da empresa alterados",
  USUARIO_CRIADO: "Usuário criado",
  USUARIO_ALTERADO: "Usuário alterado",
  USUARIO_PAPEL_ALTERADO: "Papel de usuário alterado",
  USUARIO_DESATIVADO: "Usuário desativado",
  USUARIO_REATIVADO: "Usuário reativado",
  USUARIO_SENHA_REDEFINIDA: "Senha redefinida",
  CLIENTES_IMPORTADOS: "Clientes importados",
  PRODUTOS_IMPORTADOS: "Produtos importados",
  RECORRENTE_CRIADO: "Pedido recorrente criado",
  RECORRENTES_GERADOS: "Pedidos recorrentes gerados",
  PEDIDO_CANCELADO: "Pedido cancelado",
  PEDIDO_REAGENDADO: "Pedido reagendado",
  ROTA_LIBERADA: "Rota liberada para carga",
  ROTA_REABERTA: "Rota reaberta",
  ROTA_EXCLUIDA: "Rascunho de rota excluído",
  ROTA_INICIADA: "Rota iniciada pelo motorista",
  ENTREGA_FINALIZADA: "Entrega finalizada",
  ENTREGA_CORRIGIDA: "Valores de entrega corrigidos",
  PIX_CONFIRMADO: "Pix confirmado no extrato",
  PIX_DESCONFIRMADO: "Confirmação de Pix desfeita",
  ACERTO_CONCLUIDO: "Acerto concluído",
  RETENCAO_EXECUTADA: "Arquivos apagados pela retenção",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** Campos que nunca saem na tela, mesmo que algum registro antigo os tenha. */
const HIDDEN = new Set(["passwordHash", "password", "token", "tokenHash", "receiverDocument", "document", "clientRequestId", "deliveryProofId", "orderIds", "version"]);

const FIELD_LABELS: Readonly<Record<string, string>> = {
  status: "Situação",
  paymentStatus: "Pagamento",
  amountToCollectCents: "Valor a cobrar",
  cashCents: "Dinheiro",
  pixCents: "Pix",
  expectedCents: "Esperado",
  pixInformedCents: "Pix informado",
  pixConfirmedCents: "Pix conferido",
  cashHandedInCents: "Dinheiro no caixa",
  differenceCents: "Sobra/falta",
  pixPendingCount: "Pix a conferir",
  role: "Papel",
  active: "Ativo",
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  code: "Código",
  deliveryDate: "Data",
  cancelReason: "Motivo",
  filesDeleted: "Arquivos apagados",
  pendingRemoved: "Envios abandonados removidos",
};

const ROLE_LABELS: Readonly<Record<string, string>> = { ADMIN: "Administrador", EXPEDICAO: "Expedição", MOTORISTA: "Motorista" };

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number" && field.endsWith("Cents") && Number.isSafeInteger(value)) return formatCents(value);
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "itens"}`;
  if (typeof value === "object") return "(detalhe)";
  const text = String(value);
  if (field === "status") return ORDER_STATUS_LABELS[text as keyof typeof ORDER_STATUS_LABELS] ?? ROUTE_STATUS_LABELS[text as keyof typeof ROUTE_STATUS_LABELS] ?? text;
  if (field === "paymentStatus") return PAYMENT_STATUS_LABELS[text as keyof typeof PAYMENT_STATUS_LABELS] ?? text;
  if (field === "role") return ROLE_LABELS[text] ?? text;
  return text;
}

export type AuditChange = { field: string; before: string; after: string };

/** Mudanças em "campo: antes → depois", só com o que mudou e sem dado sensível. */
export function auditChanges(before: unknown, after: unknown): AuditChange[] {
  const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
  const a = asRecord(before);
  const b = asRecord(after);
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((field) => !HIDDEN.has(field));
  return fields
    .map((field) => ({ field: FIELD_LABELS[field] ?? field, before: field in a ? formatValue(field, a[field]) : "—", after: field in b ? formatValue(field, b[field]) : "—" }))
    .filter((change) => change.before !== change.after);
}
