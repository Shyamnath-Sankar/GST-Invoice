/** Rupee amounts written the way an Indian invoice prints them. */

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

function belowHundred(value: number): string {
  if (value < 20) {
    return ONES[value] ?? "";
  }
  const ten = TENS[Math.floor(value / 10)] ?? "";
  const one = ONES[value % 10] ?? "";
  return one ? `${ten}-${one}` : ten;
}

function belowThousand(value: number): string {
  if (value < 100) {
    return belowHundred(value);
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return rest === 0
    ? `${ONES[hundreds]} hundred`
    : `${ONES[hundreds]} hundred ${belowHundred(rest)}`;
}

/** 123456 -> "one lakh twenty-three thousand four hundred fifty-six". */
function indianNumber(value: number): string {
  if (value === 0) {
    return "zero";
  }
  const parts: string[] = [];
  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1_000);
  const rest = value % 1_000;

  if (crore > 0) {
    parts.push(`${indianNumber(crore)} crore`);
  }
  if (lakh > 0) {
    parts.push(`${belowThousand(lakh)} lakh`);
  }
  if (thousand > 0) {
    parts.push(`${belowThousand(thousand)} thousand`);
  }
  if (rest > 0) {
    parts.push(belowThousand(rest));
  }
  return parts.join(" ");
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** 12345678 paise -> "One lakh twenty-three thousand four hundred fifty-six rupees and seventy-eight paise only". */
export function amountInWords(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error("Amount in words needs integer paise");
  }
  const negative = paise < 0;
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const coins = absolute % 100;

  const rupeeWords = `${indianNumber(rupees)} ${rupees === 1 ? "rupee" : "rupees"}`;
  const coinWords = coins === 0 ? "" : ` and ${belowHundred(coins)} paise`;

  return `${negative ? "Minus " : ""}${capitalise(rupeeWords)}${coinWords} only`;
}
