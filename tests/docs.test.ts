import { describe, expect, it } from "vitest";
import {
  amountInWords,
  buildPurchaseDoc,
  buildSalesDoc,
  defaultItc,
  itcTotals,
  lockedPeriodFor,
  nextDocumentNumber,
  NO_ITC_REASON,
  BLOCKED_ITC_REASON,
} from "../src/lib/docs";

const BUSINESS = {
  stateCode: "33",
  defaultPriceMode: "exclusive" as const,
  roundOff: true,
  b2clLimitPaise: 10_000_000,
  noItcScheme: false,
};

const REGISTERED = "29AAPFU0939F1ZR";

function sale(overrides: Record<string, unknown> = {}) {
  return buildSalesDoc(
    {
      number: "DC/26-27/001",
      date: "2026-10-15",
      partyName: "Walk-in customer",
      lines: [
        {
          description: "Catering",
          hsnSac: "9985",
          qty: 1,
          unitPricePaise: 100_000,
          gstRateBp: 500,
        },
      ],
      ...overrides,
    },
    BUSINESS,
  );
}

describe("buildSalesDoc", () => {
  it("splits intra-state tax, rounds per line and classifies a B2C sale", () => {
    const doc = sale({
      lines: [
        {
          description: "Catering",
          hsnSac: "9985",
          qty: 2,
          unitPricePaise: 100_000,
          gstRateBp: 500,
        },
        {
          description: "Dessert",
          hsnSac: "2105",
          qty: 1,
          unitPricePaise: 250_000,
          gstRateBp: 1800,
          cessRateBp: 1200,
        },
      ],
    });

    expect(doc.taxableValuePaise).toBe(450_000);
    expect(doc.cgstPaise).toBe(27_500);
    expect(doc.sgstPaise).toBe(27_500);
    expect(doc.igstPaise).toBe(0);
    expect(doc.cessPaise).toBe(30_000);
    expect(doc.roundOffPaise).toBe(0);
    expect(doc.totalPaise).toBe(535_000);
    expect(doc.section).toBe("b2cs");
    expect(doc.lines.map((line) => line.taxableValuePaise)).toEqual([200_000, 250_000]);
  });

  it("uses IGST and the b2b section for a registered inter-state buyer", () => {
    const doc = sale({
      partyName: "Registered buyer",
      partyGstin: REGISTERED,
      placeOfSupply: "29",
      lines: [
        {
          qty: 1,
          unitPricePaise: 100_000,
          gstRateBp: 1800,
        },
      ],
    });

    expect(doc.igstPaise).toBe(18_000);
    expect(doc.cgstPaise).toBe(0);
    expect(doc.sgstPaise).toBe(0);
    expect(doc.section).toBe("b2b");
    expect(doc.partyStateCode).toBe("29");
  });

  it("classifies an unregistered inter-state invoice above the limit as b2cl", () => {
    const doc = sale({
      placeOfSupply: "29",
      lines: [
        {
          qty: 1,
          unitPricePaise: 12_000_000,
          gstRateBp: 500,
        },
      ],
    });

    expect(doc.totalPaise).toBe(12_600_000);
    expect(doc.section).toBe("b2cl");
  });

  it("treats an export as zero-rated with place of supply 96", () => {
    const doc = sale({
      isExport: true,
      lines: [
        {
          qty: 1,
          unitPricePaise: 100_000,
          gstRateBp: 1800,
        },
      ],
    });

    expect(doc.placeOfSupply).toBe("96");
    expect(doc.section).toBe("exp");
    expect(doc.igstPaise).toBe(0);
    expect(doc.totalPaise).toBe(100_000);
    expect(doc.lines[0]?.supplyKind).toBe("zero_rated");
    expect(doc.lines[0]?.gstRateBp).toBe(0);
  });

  it("backs the tax out of an inclusive price", () => {
    const doc = sale({
      priceMode: "inclusive",
      lines: [
        {
          qty: 1,
          unitPricePaise: 105_000,
          gstRateBp: 500,
        },
      ],
    });

    expect(doc.taxableValuePaise).toBe(100_000);
    expect(doc.cgstPaise).toBe(2_500);
    expect(doc.sgstPaise).toBe(2_500);
    expect(doc.totalPaise).toBe(105_000);
  });

  it("requires an original invoice on a credit note", () => {
    expect(() => sale({ docType: "credit_note", originalNumber: "" })).toThrow(
      /original invoice/i,
    );
  });

  it("rejects a bad GSTIN, place of supply and HSN code", () => {
    expect(() => sale({ partyGstin: "29AAPFU0939F1Z9" })).toThrow(/GSTIN/i);
    expect(() => sale({ placeOfSupply: "99" })).toThrow(/place of supply/i);
    expect(() =>
      sale({ lines: [{ qty: 1, unitPricePaise: 100, gstRateBp: 500, hsnSac: "123" }] }),
    ).toThrow(/HSN/i);
  });

  it("rejects an empty document and a non-positive quantity", () => {
    expect(() => sale({ lines: [] })).toThrow(/at least one line/i);
    expect(() =>
      sale({ lines: [{ qty: 0, unitPricePaise: 100, gstRateBp: 500 }] }),
    ).toThrow(/quantity/i);
  });
});

describe("buildPurchaseDoc", () => {
  function purchase(overrides: Record<string, unknown> = {}, business = BUSINESS) {
    return buildPurchaseDoc(
      {
        number: "SUP-1",
        date: "2026-10-15",
        supplierName: "Supplier",
        supplierStateCode: "33",
        category: "inputs",
        lines: [
          {
            qty: 1,
            unitPricePaise: 100_000,
            gstRateBp: 500,
          },
        ],
        ...overrides,
      },
      business,
    );
  }

  it("defaults input ITC to eligible and records the month as the ITC period", () => {
    const doc = purchase();

    expect(doc.taxableValuePaise).toBe(100_000);
    expect(doc.cgstPaise).toBe(2_500);
    expect(doc.sgstPaise).toBe(2_500);
    expect(doc.itcPeriod).toBe("2026-10");
    expect(doc.lines[0]?.itcEligible).toBe(true);
    expect(doc.lines[0]?.itcReason).toBe("");
  });

  it("blocks expense ITC with a reason", () => {
    const doc = purchase({ category: "expense" });

    expect(doc.lines[0]?.itcEligible).toBe(false);
    expect(doc.lines[0]?.itcReason).toBe(BLOCKED_ITC_REASON);
  });

  it("blocks all ITC when the business is on the no-ITC scheme", () => {
    const doc = purchase({}, { ...BUSINESS, noItcScheme: true });

    expect(doc.lines[0]?.itcEligible).toBe(false);
    expect(doc.lines[0]?.itcReason).toBe(NO_ITC_REASON);
  });

  it("accepts a per-line ITC override and keeps its reason", () => {
    const doc = purchase({
      lines: [
        {
          qty: 1,
          unitPricePaise: 100_000,
          gstRateBp: 500,
          itcEligible: false,
          itcReason: "Personal use",
        },
      ],
    });

    expect(doc.lines[0]?.itcEligible).toBe(false);
    expect(doc.lines[0]?.itcReason).toBe("Personal use");
  });

  it("uses IGST when the supplier is in another state", () => {
    const doc = purchase({
      supplierStateCode: "29",
      placeOfSupply: "33",
      supplierGstin: REGISTERED,
    });

    expect(doc.igstPaise).toBe(5_000);
    expect(doc.cgstPaise).toBe(0);
  });

  it("rejects an unknown category and a bad ITC period", () => {
    expect(() => purchase({ category: "food" })).toThrow(/category/i);
    expect(() => purchase({ itcPeriod: "October" })).toThrow(/ITC period/i);
  });
});

describe("defaultItc", () => {
  it("marks a zero-tax line ineligible", () => {
    expect(defaultItc(false, "inputs", 0)).toEqual({
      eligible: false,
      reason: "No GST charged",
    });
  });
});

describe("itcTotals", () => {
  it("splits eligible and ineligible tax by component", () => {
    const totals = itcTotals([
      {
        itcEligible: true,
        igstPaise: 0,
        cgstPaise: 2_500,
        sgstPaise: 2_500,
        cessPaise: 0,
      },
      {
        itcEligible: false,
        igstPaise: 5_000,
        cgstPaise: 0,
        sgstPaise: 0,
        cessPaise: 100,
      },
    ]);

    expect(totals.eligible).toEqual({ igstPaise: 0, cgstPaise: 2_500, sgstPaise: 2_500, cessPaise: 0 });
    expect(totals.ineligible).toEqual({ igstPaise: 5_000, cgstPaise: 0, sgstPaise: 0, cessPaise: 100 });
  });
});

describe("lockedPeriodFor", () => {
  it("matches a monthly or quarterly lock key", () => {
    expect(lockedPeriodFor("2026-10-15", ["2026-10"])).toBe("2026-10");
    expect(lockedPeriodFor("2026-10-15", ["2026-Q3"])).toBe("2026-Q3");
    expect(lockedPeriodFor("2026-10-15", ["2026-09"])).toBeNull();
  });
});

describe("nextDocumentNumber", () => {
  it("continues the highest number in the financial-year series", () => {
    expect(
      nextDocumentNumber("invoice", "DC/", "2026-27", [
        "DC/26-27/001",
        "DC/26-27/007",
        "DC/26-27/abc",
      ]),
    ).toBe("DC/26-27/008");
    expect(nextDocumentNumber("credit_note", "DC/", "2026-27", [])).toBe("CN/26-27/001");
  });
});

describe("amountInWords", () => {
  it("writes rupees and paise in the Indian numbering system", () => {
    expect(amountInWords(12_345_678)).toBe(
      "One lakh twenty-three thousand four hundred fifty-six rupees and seventy-eight paise only",
    );
    expect(amountInWords(0)).toBe("Zero rupees only");
    expect(amountInWords(100)).toBe("One rupee only");
    expect(amountInWords(105)).toBe("One rupee and five paise only");
  });
});
