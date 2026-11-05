/**
 * Tax periods. Monthly keys look like 2026-10; quarterly keys like 2026-Q3
 * (financial-year quarter, FY starting in April).
 */

export type Frequency = "monthly" | "quarterly";

export interface DateRange {
  start: string;
  end: string;
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTHS_SHORT = MONTHS.map((month) => month.slice(0, 3));

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const QUARTER_RE = /^(\d{4})-Q([1-4])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new Error(`Bad month: ${month}`);
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseDate(date: string): { year: number; month: number; day: number } {
  const match = DATE_RE.exec(date);
  if (!match) {
    throw new Error(`Unknown date ${date}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Unknown date ${date}`);
  }
  return { year, month, day };
}

export function isMonthlyKey(key: string): boolean {
  const match = MONTH_RE.exec(key);
  if (!match) {
    return false;
  }
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function isQuarterKey(key: string): boolean {
  return QUARTER_RE.test(key);
}

export function fyOf(date: string): string {
  const { year, month } = parseDate(date);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export function fyRange(fy: string): DateRange {
  const match = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!match) {
    throw new Error(`Unknown financial year ${fy}`);
  }
  const startYear = Number(match[1]);
  const endSuffix = Number(match[2]);
  if ((startYear + 1) % 100 !== endSuffix) {
    throw new Error(`Unknown financial year ${fy}`);
  }
  return {
    start: iso(startYear, 4, 1),
    end: iso(startYear + 1, 3, 31),
  };
}

export function monthKey(date: string): string {
  const { year, month } = parseDate(date);
  return `${String(year).padStart(4, "0")}-${pad2(month)}`;
}

export function quarterKey(date: string): string {
  const { year, month } = parseDate(date);
  const fyStart = month >= 4 ? year : year - 1;
  const quarter = Math.floor(((month - 4 + 12) % 12) / 3) + 1;
  return `${fyStart}-Q${quarter}`;
}

export function periodKey(date: string, frequency: Frequency = "monthly"): string {
  return frequency === "quarterly" ? quarterKey(date) : monthKey(date);
}

export function periodRange(key: string): DateRange {
  const monthMatch = MONTH_RE.exec(key);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    if (month < 1 || month > 12) {
      throw new Error(`Bad month ${key}`);
    }
    return {
      start: iso(year, month, 1),
      end: iso(year, month, daysInMonth(year, month)),
    };
  }

  const quarterMatch = QUARTER_RE.exec(key);
  if (quarterMatch) {
    const fyStart = Number(quarterMatch[1]);
    const quarter = Number(quarterMatch[2]);
    const offset = (quarter - 1) * 3;
    const firstMonthRaw = 4 + offset;
    const firstMonth = ((firstMonthRaw - 1) % 12) + 1;
    const lastMonth = firstMonth + 2;
    const year = firstMonthRaw <= 12 ? fyStart : fyStart + 1;
    return {
      start: iso(year, firstMonth, 1),
      end: iso(year, lastMonth, daysInMonth(year, lastMonth)),
    };
  }

  throw new Error(`Unknown period ${key}`);
}

export function monthsIn(key: string): string[] {
  const { start, end } = periodRange(key);
  const first = parseDate(start);
  const last = parseDate(end);
  const result: string[] = [];
  let year = first.year;
  let month = first.month;
  while (year < last.year || (year === last.year && month <= last.month)) {
    result.push(`${String(year).padStart(4, "0")}-${pad2(month)}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}

/** Portal return period: MMYYYY of the last month in the period. */
export function returnFp(key: string): string {
  const { end } = periodRange(key);
  const { year, month } = parseDate(end);
  return `${pad2(month)}${year}`;
}

export function periodLabel(key: string): string {
  const { start, end } = periodRange(key);
  const first = parseDate(start);
  const last = parseDate(end);
  if (first.month === last.month) {
    return `${MONTHS[first.month - 1]} ${first.year}`;
  }
  return `${MONTHS_SHORT[first.month - 1]} to ${MONTHS_SHORT[last.month - 1]} ${last.year}`;
}

export function periodsForFy(fy: string, frequency: Frequency): string[] {
  fyRange(fy);
  const startYear = Number(fy.slice(0, 4));
  if (frequency === "quarterly") {
    return [1, 2, 3, 4].map((quarter) => `${startYear}-Q${quarter}`);
  }
  const result: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    const month = ((3 + index) % 12) + 1;
    const year = month >= 4 ? startYear : startYear + 1;
    result.push(`${String(year).padStart(4, "0")}-${pad2(month)}`);
  }
  return result;
}

function nextMonthStart(key: string): { year: number; month: number } {
  const { end } = periodRange(key);
  const { year, month } = parseDate(end);
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** GSTR-1: 11th of the next month, 13th for a quarter. */
export function gstr1Due(key: string): string {
  const { year, month } = nextMonthStart(key);
  return iso(year, month, isQuarterKey(key) ? 13 : 11);
}

/** GSTR-3B: 20th of the next month, 22nd for a quarter. */
export function gstr3bDue(key: string): string {
  const { year, month } = nextMonthStart(key);
  return iso(year, month, isQuarterKey(key) ? 22 : 20);
}

export function periodsForRange(start: string, end: string, frequency: Frequency): string[] {
  const from = parseDate(start);
  const to = parseDate(end);
  if (iso(from.year, from.month, from.day) > iso(to.year, to.month, to.day)) {
    throw new Error("Start date is after the end date");
  }
  const seen = new Set<string>();
  const result: string[] = [];
  let year = from.year;
  let month = from.month;
  while (year < to.year || (year === to.year && month <= to.month)) {
    const key = periodKey(iso(year, month, 1), frequency);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}
