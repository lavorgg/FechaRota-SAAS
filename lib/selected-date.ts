// Data selecionada no painel (seção 5.2): vem de ?data=AAAA-MM-DD; se faltar ou for inválida,
// é "hoje" no fuso da empresa.

import { isValidDateString, todayInTimeZone } from "../domain/dates";

export const DATE_PARAM = "data";

export function resolveSelectedDate(raw: string | string[] | undefined, timeZone: string, now: Date = new Date()): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && isValidDateString(value) ? value : todayInTimeZone(timeZone, now);
}
