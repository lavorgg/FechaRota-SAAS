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

/** Diferença, em minutos, entre o horário local do fuso e o UTC naquele instante. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Instante em que o dia começa no fuso: startOfDayInTimeZone("2026-11-16", "America/Sao_Paulo")
 * = 2026-11-16T03:00:00Z. Usado para filtrar registros por data de calendário da empresa.
 */
export function startOfDayInTimeZone(dateString: string, timeZone: string): Date {
  assertDateString(dateString);
  const guess = dateStringToDbDate(dateString).getTime();
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  // Segunda passada: acerta dias em que o deslocamento muda (horário de verão).
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * 60_000);
}

/**
 * Subtrai meses de calendário em UTC, sem "transbordar" o fim do mês:
 * 31/03 − 1 mês = 28/02 (ou 29/02), não 03/03.
 */
export function subtractMonths(instant: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 0) throw new Error("Meses inválidos.");
  const year = instant.getUTCFullYear();
  const month = instant.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(instant.getUTCDate(), lastDay), instant.getUTCHours(), instant.getUTCMinutes(), instant.getUTCSeconds(), instant.getUTCMilliseconds()));
}
