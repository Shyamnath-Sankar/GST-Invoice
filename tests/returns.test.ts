import { describe, expect, it } from "vitest";
import type {
  ReturnAdjustment,
  ReturnPurchaseDoc,
  ReturnSalesDoc,
} from "../src/lib/gst/returns";
import {
  buildGstr1,
  buildGstr3b,
  compare1vs3b,
  setOff,
} from "../src/lib/gst/returns";

const BUSINESS = { gstin: "33AAPFU0939F1Z2", stateCode: "33" };
const OTHER_GSTIN = "29AAPFU0939F1ZR";

function line(overrides: Partial<ReturnSalesDoc["lines"][number]> = {}) {
  return {
    description: "Catering",
    hsnSac: "9985",
    qty: 1,
    unit: "NOS",
    gstRateBp: 1800,
    supplyKind: "taxable" as const,
    taxableValuePaise: 100_000,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 18_000,
    cessPaise: 0,
    totalPaise: 118_000,
    ...overrides,
  };
}

function sale(overrides: Partial<ReturnSalesDoc> = {}): ReturnSalesDoc {
  return {
    id: 1,
    docType: "invoice",
    number: "INV-1",
    date: "2026-10-05",
    partyGstin: OTHER_GSTIN,
    placeOfSupply: "29",
    reverseCharge: false,
    isExport: false,
    exportWithIgst: false,
    section: "b2b",
    totalPaise: 118_000,
    amendsId: null,
    lines: [line()],
    ...overrides,
  };
}

function purchase(overrides: Partial<ReturnPurchaseDoc> = {}): ReturnPurchaseDoc {
  return {
    id: 1,
    number: "SUP-1",
    supplierName: "Supplier",
    supplierGstin: OTHER_GSTIN,
    supplierStateCode: "29",
    placeOfSupply: "33",
    reverseCharge: false,
    reconStatus: "matched",
    lines: [
      {
        description: "Inputs",
        hsnSac: "9985",
        qty: 1,
        unit: "NOS",
        gstRateBp: 1800,
        supplyKind: "taxable",
        taxableValuePaise: 50_000,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 9_000,
        cessPaise: 0,
        totalPaise: 59_000,
        itcEligible: true,
      },
    ],
    ...overrides,
  };
}

function generate(...docs: ReturnSalesDoc[]) {
  return buildGstr1({
    period: "2026-10",
    business: BUSINESS,
    docs,
    originals: [],
    cancelledNumbers: [],
  });
}

describe("setOff", () => {
  it("uses each credit head in the section 49 order and leaves cash payable", () => {
    const result = setOff(
      { igst: 10_000, cgst: 5_000, sgst: 5_000, cess: 1_000 },
      { igst: 8_000, cgst: 4_000, sgst: 3_000, cess: 500 },
    );

    expect(result.itcUsed.igst).toEqual({ igst: 8_000, cgst: 0, sgst: 0 });
    expect(result.itcUsed.cgst).toEqual({ igst: 0, cgst: 4_000, sgst: 0 });
    expect(result.itcUsed.sgst).toEqual({ igst: 0, cgst: 0, sgst: 3_000 });
    expect(result.itcUsed.cess).toEqual({ cess: 500 });
    expect(result.cash).toEqual({ igst: 2_000, cgst: 1_000, sgst: 2_000, cess: 500 });
    expect(result.balance).toEqual({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
  });

  it("lets IGST credit pay CGST and SGST before cash", () => {
    const result = setOff(
      { igst: 0, cgst: 10_000, sgst: 10_000, cess: 0 },
      { igst: 25_000, cgst: 0, sgst: 0, cess: 0 },
    );

    expect(result.itcUsed.igst).toEqual({ igst: 0, cgst: 10_000, sgst: 10_000 });
    expect(result.cash).toEqual({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
    expect(result.balance).toEqual({ igst: 5_000, cgst: 0, sgst: 0, cess: 0 });
  });
});

describe("buildGstr1", () => {
  it("splits B2B, B2C small, notes and exempt supplies with hand-computed totals", () => {
    const b2c = sale({
      id: 2,
      number: "INV-2",
      partyGstin: "",
      placeOfSupply: "33",
      section: "b2cs",
      totalPaise: 52_500,
      lines: [
        line({
          gstRateBp: 500,
          cgstPaise: 1_250,
          sgstPaise: 1_250,
          igstPaise: 0,
          taxableValuePaise: 50_000,
          totalPaise: 52_500,
        }),
      ],
    });
    const creditNote = sale({
      id: 3,
      docType: "credit_note",
      number: "CN-1",
      section: "cdnr",
      originalNumber: "INV-1",
      totalPaise: 23_600,
      lines: [
        line({
          taxableValuePaise: 20_000,
          igstPaise: 3_600,
          totalPaise: 23_600,
        }),
      ],
    });
    const exempt = sale({
      id: 4,
      number: "INV-3",
      partyGstin: "",
      placeOfSupply: "33",
      section: "b2cs",
      totalPaise: 10_000,
      lines: [
        line({
          gstRateBp: 0,
          supplyKind: "exempt",
          taxableValuePaise: 10_000,
          igstPaise: 0,
          totalPaise: 10_000,
        }),
      ],
    });

    const result = generate(sale(), b2c, creditNote, exempt);

    const sections = new Map(result.sections.map((section) => [section.key, section]));
    expect(sections.get("b2b")).toMatchObject({
      count: 1,
      taxableValuePaise: 100_000,
      igstPaise: 18_000,
      cgstPaise: 0,
      sgstPaise: 0,
      totalPaise: 118_000,
    });
    expect(sections.get("b2cs")).toMatchObject({
      count: 1,
      taxableValuePaise: 50_000,
      cgstPaise: 1_250,
      sgstPaise: 1_250,
      totalPaise: 52_500,
    });
    expect(sections.get("cdnr")).toMatchObject({
      count: 1,
      taxableValuePaise: 20_000,
      igstPaise: 3_600,
      totalPaise: 23_600,
    });

    expect(result.nil).toEqual({ expt_amt: 10_000, nil_amt: 0, ngsup_amt: 0 });
    expect(result.docCount).toBe(4);
    expect(result.issues).toEqual([]);

    const payload = result.payload as Record<string, unknown>;
    expect(payload.fp).toBe("102026");
    expect(payload.gstin).toBe(BUSINESS.gstin);

    const b2b = payload.b2b as Array<{ ctin: string; inv: Array<Record<string, unknown>> }>;
    expect(b2b[0]?.ctin).toBe(OTHER_GSTIN);
    const b2bItem = (b2b[0]?.inv[0]?.itms as Array<{ itm_det: Record<string, number> }>)[0];
    expect(b2bItem?.itm_det).toEqual({
      txval: 1_000,
      rt: 18,
      iamt: 180,
      camt: 0,
      samt: 0,
      csamt: 0,
    });

    const b2cs = payload.b2cs as Array<Record<string, unknown>>;
    expect(b2cs[0]).toEqual({
      sply_ty: "INTRA",
      pos: "33",
      typ: "OE",
      rt: 5,
      txval: 500,
      camt: 12.5,
      samt: 12.5,
      csamt: 0,
    });

    const cdnr = payload.cdnr as Array<{
      ctin: string;
      nt: Array<{ ntty: string; itms: Array<{ itm_det: Record<string, number> }> }>;
    }>;
    expect(cdnr[0]?.nt[0]?.ntty).toBe("C");
    expect(cdnr[0]?.nt[0]?.itms[0]?.itm_det).toMatchObject({ txval: 200, iamt: 36 });

    const nil = payload.nil as { inv: Array<Record<string, number | string>> };
    expect(nil.inv).toEqual([
      { sply_ty: "INTRAB2C", expt_amt: 100, nil_amt: 0, ngsup_amt: 0 },
    ]);

    const docIssue = payload.doc_issue as {
      doc_det: Array<{ doc_num: number; docs: Array<Record<string, number>> }>;
    };
    expect(docIssue.doc_det).toEqual([
      {
        doc_num: 1,
        docs: [{ num: 1, from: "INV-1", to: "INV-3", totnum: 3, cancel: 0, net_issue: 3 }],
      },
      {
        doc_num: 5,
        docs: [{ num: 1, from: "CN-1", to: "CN-1", totnum: 1, cancel: 0, net_issue: 1 }],
      },
    ]);
  });

  it("reports problems that would block a filing", () => {
    const badGstin = sale({ id: 5, number: "INV-9", partyGstin: "29AAZZZ0000Z1Z9" });
    const noHsn = sale({
      id: 6,
      number: "INV-10",
      lines: [line({ hsnSac: "" })],
    });
    const noteWithoutOriginal = sale({
      id: 7,
      docType: "credit_note",
      number: "CN-9",
      section: "cdnr",
      lines: [line()],
    });

    const result = generate(badGstin, noHsn, noteWithoutOriginal);
    const messages = result.issues.map((issue) => `${issue.level}: ${issue.message}`);

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("customer GSTIN is not valid"),
        expect.stringContaining("a line has no HSN/SAC code"),
        expect.stringContaining("original invoice number is missing"),
      ]),
    );
  });

  it("puts amended invoices in 9A with the original reference", () => {
    const original = sale({ id: 10, number: "INV-1", date: "2026-09-20" });
    const amendment = sale({
      id: 11,
      number: "INV-1~A",
      date: "2026-10-10",
      amendsId: 10,
      totalPaise: 141_600,
      lines: [
        line({
          taxableValuePaise: 120_000,
          igstPaise: 21_600,
          totalPaise: 141_600,
        }),
      ],
    });

    const result = buildGstr1({
      period: "2026-10",
      business: BUSINESS,
      docs: [amendment],
      originals: [original],
      cancelledNumbers: [],
    });

    expect(result.sections.map((section) => section.key)).toContain("b2ba");
    const payload = result.payload as Record<string, unknown>;
    expect(payload.b2b).toBeUndefined();
    const b2ba = payload.b2ba as Array<{
      ctin: string;
      inv: Array<{ oinum: string; oidt: string; inum: string }>;
    }>;
    expect(b2ba[0]?.inv[0]).toMatchObject({
      inum: "INV-1",
      oinum: "INV-1",
      oidt: "20-09-2026",
    });
  });

  it("counts cancelled invoices in the document series", () => {
    const result = buildGstr1({
      period: "2026-10",
      business: BUSINESS,
      docs: [sale({ id: 1, number: "INV-1" }), sale({ id: 2, number: "INV-3" })],
      originals: [],
      cancelledNumbers: ["INV-2"],
    });

    const payload = result.payload as {
      doc_issue: { doc_det: Array<{ doc_num: number; docs: Array<Record<string, number>> }> };
    };
    expect(payload.doc_issue.doc_det[0]?.docs[0]).toMatchObject({
      from: "INV-1",
      to: "INV-3",
      totnum: 3,
      cancel: 1,
      net_issue: 2,
    });
  });
});

describe("buildGstr3b", () => {
  it("computes output tax, ITC, reverse charge and deferred credit", () => {
    const saleDoc = sale();
    const missing = purchase({
      id: 2,
      number: "SUP-2",
      reconStatus: "missing_in_2b",
      lines: [
        {
          description: "Missing bill",
          hsnSac: "9985",
          qty: 1,
          unit: "NOS",
          gstRateBp: 1800,
          supplyKind: "taxable",
          taxableValuePaise: 20_000,
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 3_600,
          cessPaise: 0,
          totalPaise: 23_600,
          itcEligible: true,
        },
      ],
    });
    const rcm = purchase({
      id: 3,
      number: "SUP-3",
      supplierGstin: "33AAPFU0939F1Z2",
      supplierStateCode: "33",
      placeOfSupply: "33",
      reverseCharge: true,
      lines: [
        {
          description: "RCM service",
          hsnSac: "9985",
          qty: 1,
          unit: "NOS",
          gstRateBp: 1800,
          supplyKind: "taxable",
          taxableValuePaise: 10_000,
          cgstPaise: 900,
          sgstPaise: 900,
          igstPaise: 0,
          cessPaise: 0,
          totalPaise: 11_800,
          itcEligible: true,
        },
      ],
    });
    const ineligible = purchase({
      id: 4,
      number: "SUP-4",
      lines: [
        {
          description: "Blocked credit",
          hsnSac: "9985",
          qty: 1,
          unit: "NOS",
          gstRateBp: 1800,
          supplyKind: "taxable",
          taxableValuePaise: 5_000,
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 900,
          cessPaise: 0,
          totalPaise: 5_900,
          itcEligible: false,
        },
      ],
    });
    const adjustments: ReturnAdjustment[] = [
      {
        period: "2026-10",
        kind: "reversal",
        rule: "rule42",
        igstPaise: 0,
        cgstPaise: 500,
        sgstPaise: 0,
        cessPaise: 0,
      },
    ];

    const result = buildGstr3b({
      period: "2026-10",
      business: BUSINESS,
      docs: [saleDoc],
      originals: [],
      purchases: [purchase(), missing, rcm, ineligible],
      adjustments,
      has2b: true,
    });

    expect(result.outputTaxPaise).toBe(19_800);
    expect(result.eligibleItcPaise).toBe(10_300);
    expect(result.netPayablePaise).toBe(9_500);
    expect(result.deferred).toEqual({
      igstPaise: 3_600,
      cgstPaise: 0,
      sgstPaise: 0,
      cessPaise: 0,
    });
    expect(result.deferredDocs).toEqual([
      { id: 2, number: "SUP-2", supplier: "Supplier" },
    ]);

    const tables = new Map(result.tables.map((table) => [table.key, table]));
    expect(tables.get("3.1(a)")).toMatchObject({ txvalPaise: 100_000, igstPaise: 18_000 });
    expect(tables.get("3.1(d)")).toMatchObject({
      txvalPaise: 10_000,
      cgstPaise: 900,
      sgstPaise: 900,
    });
    expect(tables.get("4A(3)")).toMatchObject({ cgstPaise: 900, sgstPaise: 900 });
    expect(tables.get("4A(5)")).toMatchObject({ igstPaise: 9_900 });
    expect(tables.get("4B(1)")).toMatchObject({ igstPaise: 900, cgstPaise: 500 });
    expect(tables.get("4C")).toMatchObject({
      igstPaise: 9_000,
      cgstPaise: 400,
      sgstPaise: 900,
    });

    expect(result.payment.liability).toEqual({
      igstPaise: 18_000,
      cgstPaise: 900,
      sgstPaise: 900,
      cessPaise: 0,
    });
    expect(result.payment.cash).toEqual({
      igstPaise: 7_700,
      cgstPaise: 900,
      sgstPaise: 900,
      cessPaise: 0,
    });
    expect(result.payment.cashTotalPaise).toBe(9_500);

    const payload = result.payload as {
      sup_details: { osup_det: Record<string, number> };
      itc_elg: { itc_net: Record<string, number> };
    };
    expect(payload.sup_details.osup_det).toMatchObject({ txval: 1_000, iamt: 180 });
    expect(payload.itc_elg.itc_net).toMatchObject({ iamt: 90, camt: 4, samt: 9 });
    expect(result.notes).toEqual([]);
  });

  it("reports the amendment difference only", () => {
    const original = sale({ id: 20, totalPaise: 118_000 });
    const amendment = sale({
      id: 21,
      number: "INV-1~A",
      amendsId: 20,
      totalPaise: 141_600,
      lines: [
        line({
          taxableValuePaise: 120_000,
          igstPaise: 21_600,
          totalPaise: 141_600,
        }),
      ],
    });

    const result = buildGstr3b({
      period: "2026-10",
      business: BUSINESS,
      docs: [amendment],
      originals: [original],
      purchases: [],
      adjustments: [],
      has2b: false,
    });

    const table = result.tables.find((row) => row.key === "3.1(a)");
    expect(table).toMatchObject({ txvalPaise: 20_000, igstPaise: 3_600 });
    expect(result.notes.join(" ")).toContain("GSTR-2B has not been imported");
  });
});

describe("compare1vs3b", () => {
  it("matches GSTR-1 outward supplies with 3.1 when the books agree", () => {
    const b2c = sale({
      id: 2,
      number: "INV-2",
      partyGstin: "",
      placeOfSupply: "33",
      section: "b2cs",
      totalPaise: 52_500,
      lines: [
        line({
          gstRateBp: 500,
          cgstPaise: 1_250,
          sgstPaise: 1_250,
          igstPaise: 0,
          taxableValuePaise: 50_000,
          totalPaise: 52_500,
        }),
      ],
    });
    const creditNote = sale({
      id: 3,
      docType: "credit_note",
      number: "CN-1",
      section: "cdnr",
      originalNumber: "INV-1",
      totalPaise: 23_600,
      lines: [
        line({
          taxableValuePaise: 20_000,
          igstPaise: 3_600,
          totalPaise: 23_600,
        }),
      ],
    });
    const docs = [sale(), b2c, creditNote];
    const g1 = buildGstr1({
      period: "2026-10",
      business: BUSINESS,
      docs,
      originals: [],
      cancelledNumbers: [],
    });
    const g3 = buildGstr3b({
      period: "2026-10",
      business: BUSINESS,
      docs,
      originals: [],
      purchases: [],
      adjustments: [],
      has2b: false,
    });

    const rows = compare1vs3b(g1, g3);
    const taxable = rows.find((row) => row.head === "Taxable value");
    expect(taxable).toEqual({
      head: "Taxable value",
      gstr1Paise: 130_000,
      gstr3bPaise: 130_000,
      differencePaise: 0,
    });
    expect(rows.find((row) => row.head === "IGST")).toMatchObject({
      gstr1Paise: 14_400,
      gstr3bPaise: 14_400,
      differencePaise: 0,
    });
    expect(rows.find((row) => row.head === "CGST")).toMatchObject({
      gstr1Paise: 1_250,
      gstr3bPaise: 1_250,
      differencePaise: 0,
    });
  });
});
