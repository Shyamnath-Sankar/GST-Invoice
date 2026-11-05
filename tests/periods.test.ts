import { describe, expect, it } from "vitest";
import {
  fyOf,
  fyRange,
  gstr1Due,
  gstr3bDue,
  monthKey,
  monthsIn,
  periodKey,
  periodLabel,
  periodRange,
  periodsForFy,
  periodsForRange,
  quarterKey,
  returnFp,
} from "../src/lib/gst/periods";

describe("financial year and keys", () => {
  it("puts April to March in one financial year", () => {
    expect(fyOf("2026-03-31")).toBe("2025-26");
    expect(fyOf("2026-04-01")).toBe("2026-27");
  });

  it("builds month and quarter keys", () => {
    expect(monthKey("2026-10-05")).toBe("2026-10");
    expect(quarterKey("2027-02-01")).toBe("2026-Q4");
    expect(quarterKey("2026-04-01")).toBe("2026-Q1");
    expect(periodKey("2026-04-01", "quarterly")).toBe("2026-Q1");
  });

  it("returns the FY range", () => {
    expect(fyRange("2026-27")).toEqual({ start: "2026-04-01", end: "2027-03-31" });
    expect(() => fyRange("2026-28")).toThrow();
  });
});

describe("period ranges and labels", () => {
  it("handles monthly and quarterly ranges", () => {
    expect(periodRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodRange("2026-Q3")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(periodRange("2026-Q4")).toEqual({ start: "2027-01-01", end: "2027-03-31" });
  });

  it("handles a leap February", () => {
    expect(periodRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("lists months in a period", () => {
    expect(monthsIn("2026-Q4")).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(monthsIn("2026-11")).toEqual(["2026-11"]);
  });

  it("writes the portal return period", () => {
    expect(returnFp("2026-Q3")).toBe("122026");
    expect(returnFp("2026-10")).toBe("102026");
  });

  it("labels months and quarters", () => {
    expect(periodLabel("2026-10")).toBe("October 2026");
    expect(periodLabel("2026-Q3")).toBe("Oct to Dec 2026");
  });

  it("rejects malformed keys", () => {
    expect(() => periodRange("2026-13")).toThrow();
    expect(() => periodRange("2026-Q5")).toThrow();
    expect(() => periodRange("October")).toThrow();
  });
});

describe("period lists", () => {
  it("lists a financial year in order", () => {
    const monthly = periodsForFy("2026-27", "monthly");
    expect(monthly).toHaveLength(12);
    expect(monthly[0]).toBe("2026-04");
    expect(monthly[11]).toBe("2027-03");

    expect(periodsForFy("2026-27", "quarterly")).toEqual([
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
      "2026-Q4",
    ]);
  });

  it("covers a date range without duplicates", () => {
    expect(periodsForRange("2026-09-15", "2026-11-02", "monthly")).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(periodsForRange("2026-09-15", "2026-11-02", "quarterly")).toEqual([
      "2026-Q2",
      "2026-Q3",
    ]);
  });
});

describe("due dates", () => {
  it("uses the 11th and 20th for monthly returns", () => {
    expect(gstr1Due("2026-10")).toBe("2026-11-11");
    expect(gstr3bDue("2026-10")).toBe("2026-11-20");
  });

  it("rolls over December into January", () => {
    expect(gstr1Due("2026-12")).toBe("2027-01-11");
    expect(gstr3bDue("2026-12")).toBe("2027-01-20");
  });

  it("uses the 13th and 22nd for quarterly returns", () => {
    expect(gstr1Due("2026-Q2")).toBe("2026-10-13");
    expect(gstr3bDue("2026-Q2")).toBe("2026-10-22");
    expect(gstr1Due("2026-Q4")).toBe("2027-04-13");
    expect(gstr3bDue("2026-Q4")).toBe("2027-04-22");
  });
});
