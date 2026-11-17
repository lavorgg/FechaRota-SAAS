// Quando um template de pedido recorrente vale para uma data (seções 4 e 5.5).
// Usado pelo alerta do dashboard e, na Fase 3, pelo gerador de pedidos.

import { type DayOfWeek, dayOfWeekOfDateString, isValidDateString } from "./dates";

export type TemplateSchedule = {
  dayOfWeek: DayOfWeek;
  active: boolean;
  /** "YYYY-MM-DD" */
  startsOn: string;
  /** "YYYY-MM-DD". O template fica pausado ATÉ este dia, inclusive. */
  pausedUntil: string | null;
};

export function isTemplateDueOn(template: TemplateSchedule, date: string): boolean {
  if (!isValidDateString(date)) {
    throw new Error(`Data inválida: "${date}".`);
  }
  if (!template.active) return false;
  if (dayOfWeekOfDateString(date) !== template.dayOfWeek) return false;
  // Datas "YYYY-MM-DD" comparam certo como texto.
  if (date < template.startsOn) return false;
  if (template.pausedUntil !== null && date <= template.pausedUntil) return false;
  return true;
}
