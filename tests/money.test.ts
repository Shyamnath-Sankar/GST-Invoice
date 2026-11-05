import { describe, expect, it } from "vitest";
import {
  divRoundHalfUp,
  formatINR,
  formatRateBp,
  percentToBp,
  roundHalfUp,
  sumPaise,
  taxPaise,
  toPaise,
  toRupees,
} from "../src/lib/money";

describe("toPaise", () => {
  it("parses rupees with Indian grouping and two decimals", () => {
    expect(toPaise("1,234.56")).toBe(123456);
    expect(toPaise("1050")).toBe(105000);
    expect(toPaise(10.1)).toBe(1010);
    expect(toPaise("10.10")).toBe(1010);
    expect(toPaise("0.01")).toBe(1);
  });

  it("rounds half-up at the third decimal", () => {
    expect(toPaise("0.005")).toBe(1);
    expect(toPaise("0.0049")).toBe(0);
    expect(toPaise("-0.005")).toBe(-1);
    expect(toPaise("12.345")).toBe(1235);
  });

  it("treats blank input as zero", () => {
    expect(toPaise(null)).toBe(0);
    expect(toPaise(undefined)).toBe(0);
    expect(toPaise("")).toBe(0);
    expect(toPaise("   ")).toBe(0);
  });

  it("rejects non-numeric input", () => {
    expect(() => toPaise("twelve")).toThrow();
  });
});

describe("divRoundHalfUp", () => {
  it("rounds exact halves away from zero", () => {
    expect(divRoundHalfUp(1, 2)).toBe(1);
    expect(divRoundHalfUp(3, 2)).toBe(2);
    expect(divRoundHalfUp(-1, 2)).toBe(-1);
    expect(divRoundHalfUp(-3, 2)).toBe(-2);
    expect(divRoundHalfUp(1, 3)).toBe(0);
  });
});

describe("roundHalfUp", () => {
  it("rounds halves away from zero", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(-2.4)).toBe(-2);
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(0)).toBe("0.00");
    expect(formatINR(5)).toBe("0.05");
    expect(formatINR(123456)).toBe("1,234.56");
    expect(formatINR(12345600)).toBe("1,23,456.00");
    expect(formatINR(10000000)).toBe("1,00,000.00");
    expect(formatINR(1234567890)).toBe("1,23,45,678.90");
  });

  it("keeps the sign in front", () => {
    expect(formatINR(-12345600)).toBe("-1,23,456.00");
  });
});

describe("rate helpers", () => {
  it("converts percent to basis points and back", () => {
    expect(percentToBp(5)).toBe(500);
    expect(percentToBp(0.25)).toBe(25);
    expect(percentToBp(18)).toBe(1800);
    expect(formatRateBp(500)).toBe("5%");
    expect(formatRateBp(25)).toBe("0.25%");
  });

  it("calculates tax half-up on integer paise", () => {
    expect(taxPaise(2500000, 500)).toBe(125000);
    expect(taxPaise(1010, 250)).toBe(25);
    expect(taxPaise(1030, 250)).toBe(26);
    expect(taxPaise(100, 0)).toBe(0);
  });
});

describe("toRupees and sumPaise", () => {
  it("converts paise for form display", () => {
    expect(toRupees(123456)).toBe(1234.56);
  });

  it("sums integer paise", () => {
    expect(sumPaise([1, 2, 3])).toBe(6);
    expect(sumPaise([])).toBe(0);
  });
});
