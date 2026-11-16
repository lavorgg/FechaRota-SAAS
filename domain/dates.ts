// Datas e fuso horário (seção 3.3).
//
// Dois conceitos que nunca se misturam:
// - DATA DE CALENDÁRIO (data de entrega): texto "YYYY-MM-DD", sem hora e sem fuso.
// - INSTANTE (deliveredAt, createdAt...): Date em UTC, exibido no fuso da empresa.
//
// Os servidores rodam em UTC. Nada aqui usa getDay(), getDate() ou toDateString() locais.

export const DAYS_OF_WEEK = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_OF_WEEK_LABELS: Readonly<Record<DayOfWeek, string>> = {
  DOM: "Domingo",
  SEG: "Segunda-feira",
  TER: "Terça-feira",
  QUA: "Quarta-feira",
  QUI: "Quinta-feira",
  SEX: "Sexta-feira",
  SAB: "Sábado",
};

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const DATE_STRING_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Verdadeiro para "YYYY-MM-DD" que existe no calendário ("2026-02-30" é falso). */
export function isValidDateString(value: string): boolean {
  const match = DATE_STRING_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function assertDateString(value: string): void {
  if (!isValidDateString(value)) {
    throw new Error(`Data inválida: "${value}". Use o formato AAAA-MM-DD.`);
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * "Hoje" no fuso informado, como "YYYY-MM-DD".
 * Às 00:30 UTC de 17/11 ainda são 21:30 de 16/11 em São Paulo: o resultado é "…-11-16".
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Não foi possível calcular a data no fuso ${timeZone}.`);
    return part.value;
  };
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Dia da semana de uma data de calendário. Não depende de fuso: 2026-11-16 é sempre SEG. */
export function dayOfWeekOfDateString(dateString: string): DayOfWeek {
  assertDateString(dateString);
  const index = dateStringToDbDate(dateString).getUTCDay();
  const day = DAYS_OF_WEEK[index];
  if (!day) throw new Error(`Dia da semana fora do intervalo: ${index}.`);
  return day;
}

/** Dia da semana de "hoje" no fuso da empresa. */
export function dayOfWeekInTimeZone(timeZone: string, now: Date = new Date()): DayOfWeek {
  return dayOfWeekOfDateString(todayInTimeZone(timeZone, now));
}

/** Soma (ou subtrai) dias de calendário: addDays("2026-02-28", 1) -> "2026-03-01". */
export function addDays(dateString: string, days: number): string {
  assertDateString(dateString);
  if (!Number.isInteger(days)) {
    throw new Error("addDays exige um número inteiro de dias.");
  }
  const date = dateStringToDbDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return dbDateToDateString(date);
}

/**
 * "YYYY-MM-DD" -> Date à meia-noite UTC, que é como o Prisma lê e grava colunas @db.Date.
 * Use somente para falar com o banco, nunca para exibir.
 */
export function dateStringToDbDate(dateString: string): Date {
  assertDateString(dateString);
  return new Date(`${dateString}T00:00:00.000Z`);
}

/** Date vindo de coluna @db.Date (meia-noite UTC) -> "YYYY-MM-DD". */
export function dbDateToDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Exibição de data de calendário em pt-BR: "2026-11-16" -> "16/11/2026". */
export function formatDateString(dateString: string): string {
  assertDateString(dateString);
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

/** Exibição de um instante no fuso da empresa: "16/11/2026 21:30". */
export function formatInstant(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(instant)
    .replace(",", "");
}
