import { describe, expect, it } from "vitest";
import {
  calcDocument,
  calcLine,
  classifySalesDoc,
  NON_TAXABLE_KINDS,
  SUPPLY_KINDS,
  type SupplyKind,
} from "../src/lib/gst/gst";

describe("calcLine", () => {
  it("splits intra-state tax into equal CGST and SGST", () => {
    const result = calcLine(
      { qty: 100, unitPricePaise: 25000, gstRateBp: 500 },
      { inclusive: false, interState: false },
    );
    expect(result.taxableValuePaise).toBe(2500000);
    expect(result.cgstPaise).toBe(62500);
    expect(result.sgstPaise).toBe(62500);
    expect(result.igstPaise).toBe(0);
    expect(result.totalPaise).toBe(2625000);
  });

  it("uses IGST for an inter-state supply", () => {
    const result = calcLine(
      { qty: 1, unitPricePaise: 100000, gstRateBp: 1800 },
      { inclusive: false, interState: true },
    );
    expect(result.igstPaise).toBe(18000);
    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
  });

  it("reduces the taxable value by the discount", () => {
    const result = calcLine(
      {
        qty: 10,
        unitPricePaise: 10000,
        discountPaise: 10000,
        gstRateBp: 500,
      },
      { inclusive: false, interState: false },
    );
    expect(result.taxableValuePaise).toBe(90000);
    expect(result.cgstPaise).toBe(2250);
    expect(result.totalPaise).toBe(94500);
  });

  it("back-calculates an inclusive price so the total equals the amount charged", () => {
    const result = calcLine(
      { qty: 1, unitPricePaise: 105000, gstRateBp: 500 },
      { inclusive: true, interState: false },
    );
    expect(result.taxableValuePaise).toBe(100000);
    expect(result.cgstPaise).toBe(2500);
    expect(result.sgstPaise).toBe(2500);
    expect(result.totalPaise).toBe(105000);
  });

  it("keeps an odd inclusive total equal to the gross", () => {
    const result = calcLine(
      { qty: 3, unitPricePaise: 33333, gstRateBp: 1800 },
      { inclusive: true, interState: false },
    );
    expect(result.totalPaise).toBe(99999);
    expect(result.cgstPaise).toBe(result.sgstPaise);
    expect(result.taxableValuePaise + result.cgstPaise + result.sgstPaise).toBe(99999);
  });

  it("charges cess on the taxable value", () => {
    const result = calcLine(
      { qty: 1, unitPricePaise: 100000, gstRateBp: 500, cessRateBp: 1200 },
      { inclusive: false, interState: false },
    );
    expect(result.cessPaise).toBe(12000);
    expect(result.totalPaise).toBe(117000);
  });

  it("back-calculates an inclusive price with cess", () => {
    const result = calcLine(
      { qty: 1, unitPricePaise: 1120000, gstRateBp: 500, cessRateBp: 1200 },
      { inclusive: true, interState: false },
    );
    expect(result.totalPaise).toBe(1120000);
    expect(
      result.taxableValuePaise +
        result.cgstPaise +
        result.sgstPaise +
        result.cessPaise,
    ).toBe(1120000);
  });

  it.each(NON_TAXABLE_KINDS)("charges no tax on a %s supply", (kind) => {
    const result = calcLine(
      { qty: 2, unitPricePaise: 5000, gstRateBp: 500, supplyKind: kind },
      { inclusive: false, interState: false },
    );
    expect(result.gstRateBp).toBe(0);
    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
    expect(result.totalPaise).toBe(10000);
  });

  it("treats a zero-rated supply as taxable for buckets but at zero rate", () => {
    const result = calcLine(
      {
        qty: 1,
        unitPricePaise: 50000,
        gstRateBp: 0,
        supplyKind: "zero_rated",
      },
      { inclusive: false, interState: true },
    );
    expect(result.taxableValuePaise).toBe(50000);
    expect(result.taxPaise).toBe(0);
    expect(result.totalPaise).toBe(50000);
  });

  it("turns a taxable line into a zero-rated export", () => {
    const result = calcLine(
      { qty: 1, unitPricePaise: 100000, gstRateBp: 1800 },
      { inclusive: false, interState: true, isExport: true },
    );
    expect(result.supplyKind).toBe("zero_rated");
    expect(result.gstRateBp).toBe(0);
    expect(result.taxableValuePaise).toBe(100000);
    expect(result.igstPaise).toBe(0);
    expect(result.totalPaise).toBe(100000);
  });

  it("charges IGST on an export when export with IGST is set", () => {
    const result = calcLine(
      { qty: 1, unitPricePaise: 100000, gstRateBp: 1800 },
      { inclusive: false, interState: true, isExport: true, exportWithIgst: true },
    );
    expect(result.supplyKind).toBe("zero_rated");
    expect(result.gstRateBp).toBe(1800);
    expect(result.igstPaise).toBe(18000);
    expect(result.totalPaise).toBe(118000);
  });

  it("forces a zero-rated supply to a zero rate unless it is an export with IGST", () => {
    const domestic = calcLine(
      { qty: 1, unitPricePaise: 100000, gstRateBp: 1800, supplyKind: "zero_rated" },
      { inclusive: false, interState: true },
    );
    expect(domestic.gstRateBp).toBe(0);
    expect(domestic.totalPaise).toBe(100000);
  });

  it("rejects a non-positive quantity and a negative rate", () => {
    expect(() =>
      calcLine(
        { qty: 0, unitPricePaise: 10000, gstRateBp: 500 },
        { inclusive: false, interState: false },
      ),
    ).toThrow();
    expect(() =>
      calcLine(
        { qty: 1, unitPricePaise: -1, gstRateBp: 500 },
        { inclusive: false, interState: false },
      ),
    ).toThrow();
  });

  it("rounds each tax component half-up to the paisa", () => {
    const lower = calcLine(
      { qty: 1, unitPricePaise: 1010, gstRateBp: 500 },
      { inclusive: false, interState: false },
    );
    expect(lower.cgstPaise).toBe(25);

    const higher = calcLine(
      { qty: 1, unitPricePaise: 1030, gstRateBp: 500 },
      { inclusive: false, interState: false },
    );
    expect(higher.cgstPaise).toBe(26);
  });

  it("rounds a fractional quantity to three decimals before multiplying", () => {
    const result = calcLine(
      { qty: 2.5, unitPricePaise: 10000, gstRateBp: 500 },
      { inclusive: false, interState: false },
    );
    expect(result.taxableValuePaise).toBe(25000);
    expect(result.cgstPaise).toBe(625);
  });

  it("rejects bad input", () => {
    expect(() =>
      calcLine(
        {
          qty: 1,
          unitPricePaise: 10000,
          gstRateBp: 500,
          supplyKind: "something" as SupplyKind,
        },
        { inclusive: false, interState: false },
      ),
    ).toThrow();
    expect(() =>
      calcLine(
        { qty: 1, unitPricePaise: 10000, gstRateBp: 10100 },
        { inclusive: false, interState: false },
      ),
    ).toThrow();
    expect(() =>
      calcLine(
        {
          qty: 1,
          unitPricePaise: 10000,
          gstRateBp: 500,
          discountPaise: 20000,
        },
        { inclusive: false, interState: false },
      ),
    ).toThrow();
    expect(() =>
      calcLine(
        { qty: 1, unitPricePaise: 100.5, gstRateBp: 500 },
        { inclusive: false, interState: false },
      ),
    ).toThrow();
  });
});

describe("calcDocument", () => {
  it("totals lines, groups by rate and rounds off to the rupee", () => {
    const document = calcDocument(
      [
        { qty: 150, unitPricePaise: 18000, gstRateBp: 500, hsnSac: "996334" },
        { qty: 1, unitPricePaise: 150050, gstRateBp: 500, hsnSac: "996334" },
        { qty: 1, unitPricePaise: 50000, gstRateBp: 1800, hsnSac: "996601" },
      ],
      { inclusive: false, interState: false, roundOff: true },
    );

    expect(document.taxableValuePaise).toBe(2900050);
    expect(document.cgstPaise).toBe(67500 + 3751 + 4500);
    expect(document.sgstPaise).toBe(67500 + 3751 + 4500);
    expect(document.byRate).toEqual([
      {
        gstRateBp: 500,
        taxableValuePaise: 2850050,
        cgstPaise: 71251,
        sgstPaise: 71251,
        igstPaise: 0,
        cessPaise: 0,
      },
      {
        gstRateBp: 1800,
        taxableValuePaise: 50000,
        cgstPaise: 4500,
        sgstPaise: 4500,
        igstPaise: 0,
        cessPaise: 0,
      },
    ]);

    const exact = 2900050 + 75751 + 75751;
    expect(document.totalPaise).toBe(3051600);
    expect(document.roundOffPaise).toBe(3051600 - exact);
  });

  it("leaves the total exact when round off is off", () => {
    const document = calcDocument(
      [{ qty: 1, unitPricePaise: 1010, gstRateBp: 500 }],
      { inclusive: false, interState: false },
    );
    expect(document.totalPaise).toBe(1010 + 25 + 25);
    expect(document.roundOffPaise).toBe(0);
  });

  it("groups non-taxable values by kind", () => {
    const document = calcDocument(
      [
        { qty: 1, unitPricePaise: 10000, gstRateBp: 500 },
        { qty: 1, unitPricePaise: 20000, gstRateBp: 0, supplyKind: "nil" },
        { qty: 1, unitPricePaise: 30000, gstRateBp: 0, supplyKind: "exempt" },
      ],
      { inclusive: false, interState: false },
    );
    expect(document.byKind).toEqual({
      taxable: 10000,
      nil: 20000,
      exempt: 30000,
    });
    expect(document.byRate).toHaveLength(1);
  });
  it("keeps an export line in the zero-rated kind bucket", () => {
    const document = calcDocument(
      [{ qty: 1, unitPricePaise: 100000, gstRateBp: 1800 }],
      { inclusive: false, interState: true, isExport: true },
    );
    expect(document.byKind).toEqual({ zero_rated: 100000 });
    expect(document.byRate).toEqual([
      {
        gstRateBp: 0,
        taxableValuePaise: 100000,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        cessPaise: 0,
      },
    ]);
    expect(document.igstPaise).toBe(0);
  });
});

describe("classifySalesDoc", () => {
  const limit = 10000000;

  it("classifies invoices", () => {
    expect(
      classifySalesDoc({
        docType: "invoice",
        partyGstin: "33AAPFU0939F1Z2",
        interState: false,
        totalPaise: 1000,
        b2clLimitPaise: limit,
      }),
    ).toBe("b2b");

    expect(
      classifySalesDoc({
        docType: "invoice",
        partyGstin: "",
        interState: true,
        totalPaise: limit + 100,
        b2clLimitPaise: limit,
      }),
    ).toBe("b2cl");

    expect(
      classifySalesDoc({
        docType: "invoice",
        partyGstin: "",
        interState: true,
        totalPaise: limit,
        b2clLimitPaise: limit,
      }),
    ).toBe("b2cs");

    expect(
      classifySalesDoc({
        docType: "invoice",
        partyGstin: "",
        interState: false,
        totalPaise: 90000000,
        b2clLimitPaise: limit,
      }),
    ).toBe("b2cs");

    expect(
      classifySalesDoc({
        docType: "invoice",
        partyGstin: "",
        interState: true,
        totalPaise: 500,
        b2clLimitPaise: 100,
        isExport: true,
      }),
    ).toBe("exp");
  });

  it("classifies credit and debit notes", () => {
    expect(
      classifySalesDoc({
        docType: "credit_note",
        partyGstin: "33AAPFU0939F1Z2",
        interState: false,
        totalPaise: 500,
        b2clLimitPaise: 100,
      }),
    ).toBe("cdnr");

    expect(
      classifySalesDoc({
        docType: "debit_note",
        partyGstin: "",
        interState: true,
        totalPaise: limit + 1,
        b2clLimitPaise: limit,
      }),
    ).toBe("cdnur");

    expect(
      classifySalesDoc({
        docType: "credit_note",
        partyGstin: "",
        interState: false,
        totalPaise: 500,
        b2clLimitPaise: limit,
      }),
    ).toBe("b2cs");
  });
});

describe("supply kinds", () => {
  it("exposes the five kinds", () => {
    expect([...SUPPLY_KINDS]).toEqual([
      "taxable",
      "exempt",
      "nil",
      "non_gst",
      "zero_rated",
    ]);
  });
});
