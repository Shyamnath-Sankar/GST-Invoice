/**
 * Money helpers. All amounts are integer paise; all rates are integer basis points.
 * Never use floating point for a stored or computed amount.
 */

export const PAISE_PER_RUPEE = 100;
export const BP_SCALE = 10_000;

/** Divide two integers, rounding a half away from zero. */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    throw new Error("divRoundHalfUp requires finite numbers");
  }
  if (denominator === 0) {
    throw new Error("divRoundHalfUp requires a non-zero denominator");
  }
  const negative = numerator < 0 !== denominator < 0;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const quotient = Math.floor(n / d);
  const remainder = n - quotient * d;
  return (negative ? -1 : 1) * (remainder * 2 >= d ? quotient + 1 : quotient);
}

/** Round a number to the nearest integer, with exact halves going away from zero. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("roundHalfUp requires a finite number");
  }
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5);
}

function plainNumberString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Amount must be a finite number");
  }
  const text = String(value);
  if (!/e/i.test(text)) {
    return text;
  }
  // Amounts are capped well below 1e21, so toFixed is exact enough here.
  return value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Parse a rupee amount ("1,234.56", "-5", 10.1) into integer paise, rounding
 * half-up at the third decimal. Returns 0 for null, undefined and blank input.
 */
export function toPaise(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const text = (typeof value === "number" ? plainNumberString(value) : value)
    .replace(/,/g, "")
    .replace(/\s/g, "");
  if (text === "" || text === "+" || text === "-") {
    return 0;
  }
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) {
    throw new Error(`Not a rupee amount: ${String(value)}`);
  }
  const sign = match[1] === "-" ? -1 : 1;
  const whole = match[2] ?? "";
  const fraction = match[3] ?? "";
  if (whole === "" && fraction === "") {
    return 0;
  }

  const wholePaise = Number(whole === "" ? "0" : whole) * PAISE_PER_RUPEE;
  const fractionPaise = Number(`${fraction}00`.slice(0, 2));
  const thirdDigit = fraction.length > 2 ? Number(fraction.charAt(2)) : 0;
  const total = wholePaise + fractionPaise + (thirdDigit >= 5 ? 1 : 0);

  if (!Number.isSafeInteger(total)) {
    throw new Error("Amount is too large");
  }
  return sign * total;
}

/** Rupees as a number, for prefilling a form field. Never for arithmetic. */
export function toRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

function groupIndian(whole: number): string {
  const digits = String(whole);
  if (digits.length <= 3) {
    return digits;
  }
  const tail = digits.slice(-3);
  let head = digits.slice(0, -3);
  const groups: string[] = [];
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head !== "") {
    groups.unshift(head);
  }
  return [...groups, tail].join(",");
}

/** 12345678 -> "1,23,456.78" (Indian grouping, no currency symbol). */
export function formatINR(paise: number): string {
  const rounded = Math.trunc(paise);
  const negative = rounded < 0;
  const absolute = Math.abs(rounded);
  const whole = Math.floor(absolute / PAISE_PER_RUPEE);
  const fraction = absolute % PAISE_PER_RUPEE;
  return `${negative ? "-" : ""}${groupIndian(whole)}.${String(fraction).padStart(2, "0")}`;
}

/** 5% -> 500 bp, 0.25% -> 25 bp. */
export function percentToBp(percent: number): number {
  return roundHalfUp(percent * 100);
}

/** 500 bp -> "5%", 25 bp -> "0.25%". */
export function formatRateBp(rateBp: number): string {
  return `${rateBp / 100}%`;
}

/** Tax on an integer paise amount at an integer basis-point rate, half-up. */
export function taxPaise(amountPaise: number, rateBp: number): number {
  return divRoundHalfUp(amountPaise * rateBp, BP_SCALE);
}

/** Sum integer paise without accumulating floating point error. */
export function sumPaise(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}
