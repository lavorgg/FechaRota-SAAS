import { describe, expect, it } from "vitest";

import { addDays, dateStringToDbDate, dayOfWeekInTimeZone, dayOfWeekOfDateString, dbDateToDateString, formatDateString, formatInstant, isValidDateString, isValidTimeZone, todayInTimeZone, startOfDayInTimeZone, subtractMonths } from "./dates";

const SP = "America/Sao_Paulo";

describe('"hoje" no fuso da empresa', () => {
  it("perto da meia-noite UTC ainda é o dia anterior em São Paulo (21h30)", () => {
    // 00:30 UTC de terça 17/11 = 21:30 de segunda 16/11 em São Paulo.
    const now = new Date("2026-11-17T00:30:00.000Z");
    expect(todayInTimeZone(SP, now)).toBe("2026-11-16");
    expect(dayOfWeekInTimeZone(SP, now)).toBe("SEG");
    // Um servidor em UTC que usasse getDay() responderia terça.
    expect(now.getUTCDay()).toBe(2);
  });

  it("vira o dia às 03:00 UTC (meia-noite em São Paulo)", () => {
    expect(todayInTimeZone(SP, new Date("2026-11-17T02:59:59.999Z"))).toBe("2026-11-16");
    expect(todayInTimeZone(SP, new Date("2026-11-17T03:00:00.000Z"))).toBe("2026-11-17");
    expect(dayOfWeekInTimeZone(SP, new Date("2026-11-17T02:59:59.999Z"))).toBe("SEG");
    expect(dayOfWeekInTimeZone(SP, new Date("2026-11-17T03:00:00.000Z"))).toBe("TER");
  });

  it("virada de mês e de ano", () => {
    expect(todayInTimeZone(SP, new Date("2026-12-01T01:00:00.000Z"))).toBe("2026-11-30");
    expect(todayInTimeZone(SP, new Date("2027-01-01T02:00:00.000Z"))).toBe("2026-12-31");
    expect(dayOfWeekInTimeZone(SP, new Date("2027-01-01T02:00:00.000Z"))).toBe("QUI");
  });

  it("respeita outros fusos (Manaus é UTC-4, Fernando de Noronha é UTC-2)", () => {
    const now = new Date("2026-11-17T03:30:00.000Z");
    expect(todayInTimeZone("America/Manaus", now)).toBe("2026-11-16");
    expect(todayInTimeZone(SP, now)).toBe("2026-11-17");
    expect(todayInTimeZone("America/Noronha", now)).toBe("2026-11-17");
    expect(todayInTimeZone("UTC", now)).toBe("2026-11-17");
  });

  it("sábado à noite em São Paulo não vira domingo", () => {
    const now = new Date("2026-11-22T01:00:00.000Z"); // domingo em UTC
    expect(todayInTimeZone(SP, now)).toBe("2026-11-21");
    expect(dayOfWeekInTimeZone(SP, now)).toBe("SAB");
  });
});

describe("data de calendário", () => {
  it("dia da semana não depende de fuso", () => {
    expect(dayOfWeekOfDateString("2026-11-15")).toBe("DOM");
    expect(dayOfWeekOfDateString("2026-11-16")).toBe("SEG");
    expect(dayOfWeekOfDateString("2026-11-17")).toBe("TER");
    expect(dayOfWeekOfDateString("2026-11-18")).toBe("QUA");
    expect(dayOfWeekOfDateString("2026-11-19")).toBe("QUI");
    expect(dayOfWeekOfDateString("2026-11-20")).toBe("SEX");
    expect(dayOfWeekOfDateString("2026-11-21")).toBe("SAB");
  });

  it("isValidDateString", () => {
    expect(isValidDateString("2026-11-16")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("16/11/2026")).toBe(false);
    expect(isValidDateString("2026-11-16T00:00:00Z")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });

  it("addDays atravessa mês, ano e ano bissexto", () => {
    expect(addDays("2026-11-16", 1)).toBe("2026-11-17");
    expect(addDays("2026-11-16", -1)).toBe("2026-11-15");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-16", 0)).toBe("2026-11-16");
    expect(() => addDays("2026-11-16", 1.5)).toThrow();
    expect(() => addDays("16/11/2026", 1)).toThrow();
  });

  it("ida e volta com o formato do banco (@db.Date = meia-noite UTC)", () => {
    const dbDate = dateStringToDbDate("2026-11-16");
    expect(dbDate.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(dbDateToDateString(dbDate)).toBe("2026-11-16");
  });

  it("formatDateString exibe em pt-BR sem passar por Date", () => {
    expect(formatDateString("2026-11-16")).toBe("16/11/2026");
    expect(formatDateString("2026-01-05")).toBe("05/01/2026");
  });
});

describe("instantes", () => {
  it("formatInstant exibe no fuso da empresa", () => {
    const instant = new Date("2026-11-17T00:30:00.000Z");
    expect(formatInstant(instant, SP)).toBe("16/11/2026 21:30");
    expect(formatInstant(instant, "UTC")).toBe("17/11/2026 00:30");
  });

  it("isValidTimeZone", () => {
    expect(isValidTimeZone(SP)).toBe(true);
    expect(isValidTimeZone("America/Manaus")).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
  });
});

describe("startOfDayInTimeZone", () => {
  it("meia-noite local em UTC", () => {
    expect(startOfDayInTimeZone("2026-11-16", "America/Sao_Paulo").toISOString()).toBe("2026-11-16T03:00:00.000Z");
    expect(startOfDayInTimeZone("2026-11-16", "America/Manaus").toISOString()).toBe("2026-11-16T04:00:00.000Z");
    expect(startOfDayInTimeZone("2026-11-16", "America/Noronha").toISOString()).toBe("2026-11-16T02:00:00.000Z");
    expect(startOfDayInTimeZone("2026-11-16", "UTC").toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });
});

describe("subtractMonths", () => {
  it("subtrai meses sem transbordar o fim do mês", () => {
    expect(subtractMonths(new Date("2026-11-20T06:00:00Z"), 12).toISOString()).toBe("2025-11-20T06:00:00.000Z");
    expect(subtractMonths(new Date("2026-03-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(subtractMonths(new Date("2028-03-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(subtractMonths(new Date("2026-01-15T00:00:00Z"), 3).toISOString()).toBe("2025-10-15T00:00:00.000Z");
    expect(() => subtractMonths(new Date(), -1)).toThrow();
  });
});
