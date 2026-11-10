/**
 * GSTR-1 and GSTR-3B preparation. Pure functions on integer paise: the server
 * loads rows, these functions decide every figure. Portal JSON is emitted in
 * rupees (paise / 100) because that is what the GST portal accepts.
 *
 * Behaviour mirrors the old Python service so returns can be compared line by
 * line. The only deliberate difference is the unit: every internal amount is
 * integer paise, never a float.
 */
import type { Gstr1Section, SupplyKind } from "./gst";
import { validateGstin } from "./gstin";
import { returnFp } from "./periods";
import { formatINR } from "../money";

export type ReturnDocType = "invoice" | "credit_note" | "debit_note";
export type ReturnReconStatus =
  | "pending"
  | "matched"
  | "mismatch"
  | "missing_in_2b"
  | "only_in_2b";

export const SCHEMA_VERSION = "gstr1-2025.05 / gstr3b-2024.01";

const HEADS = ["igst", "cgst", "sgst", "cess"] as const;
type Head = (typeof HEADS)[number];

export interface TaxHeads {
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
}

export interface ReturnLine {
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  gstRateBp: number;
  supplyKind: SupplyKind;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
  itcEligible?: boolean;
}

export interface ReturnSalesDoc {
  id: number;
  docType: ReturnDocType;
  number: string;
  date: string;
  partyGstin: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  isExport: boolean;
  exportWithIgst: boolean;
  section: Gstr1Section;
  totalPaise: number;
  amendsId: number | null;
  originalNumber?: string;
  originalDate?: string | null;
  lines: ReturnLine[];
}

export interface ReturnPurchaseDoc {
  id: number;
  docType?: ReturnDocType;
  number: string;
  supplierName: string;
  supplierGstin: string;
  supplierStateCode: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  reconStatus: ReturnReconStatus;
  lines: ReturnLine[];
}

export interface ReturnAdjustment {
  period: string;
  kind: "reversal" | "reclaim";
  rule: string;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
}

export interface ReturnBusiness {
  gstin: string;
  stateCode: string;
}

export interface ReturnIssue {
  level: "error" | "warning";
  docId?: number;
  message: string;
}

export interface Gstr1SectionRow extends TaxHeads {
  key: string;
  label: string;
  count: number;
  taxableValuePaise: number;
  totalPaise: number;
}

export interface HsnRow extends TaxHeads {
  num: number;
  hsnSac: string;
  description: string;
  uqc: string;
  qty: number;
  rateBp: number;
  taxableValuePaise: number;
}

export interface Gstr1Result {
  period: string;
  schemaVersion: string;
  payload: Record<string, unknown>;
  sections: Gstr1SectionRow[];
  nil: { expt_amt: number; nil_amt: number; ngsup_amt: number };
  hsn: { b2b: HsnRow[]; b2c: HsnRow[] };
  issues: ReturnIssue[];
  docCount: number;
}

export interface Gstr3bTable extends TaxHeads {
  key: string;
  label: string;
  txvalPaise?: number;
}

export interface Gstr3bPayment {
  liability: TaxHeads;
  rcmCash: TaxHeads;
  itcUsed: Record<string, Record<string, number>>;
  cash: TaxHeads;
  closingCredit: TaxHeads;
  interestPaise: number;
  lateFeePaise: number;
  cashTotalPaise: number;
}

export interface Gstr3bResult {
  period: string;
  schemaVersion: string;
  payload: Record<string, unknown>;
  has2b: boolean;
  tables: Gstr3bTable[];
  payment: Gstr3bPayment;
  outputTaxPaise: number;
  eligibleItcPaise: number;
  netPayablePaise: number;
  deferred: TaxHeads;
  deferredDocs: Array<{ id: number; number: string; supplier: string }>;
  notes: string[];
}

export interface CompareRow {
  head: string;
  gstr1Paise: number;
  gstr3bPaise: number;
  differencePaise: number;
}

export interface PlainHeads {
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

export interface SetOffResult {
  itcUsed: {
    igst: { igst: number; cgst: number; sgst: number };
    cgst: { igst: number; cgst: number; sgst: number };
    sgst: { igst: number; cgst: number; sgst: number };
    cess: { cess: number };
  };
  cash: PlainHeads;
  balance: PlainHeads;
}

function zeroHeads(): TaxHeads {
  return { igstPaise: 0, cgstPaise: 0, sgstPaise: 0, cessPaise: 0 };
}

function addHeads(target: TaxHeads, source: TaxHeads, sign = 1): TaxHeads {
  target.igstPaise += sign * source.igstPaise;
  target.cgstPaise += sign * source.cgstPaise;
  target.sgstPaise += sign * source.sgstPaise;
  target.cessPaise += sign * source.cessPaise;
  return target;
}

function head(line: ReturnLine, key: Head): number {
  if (key === "igst") return line.igstPaise;
  if (key === "cgst") return line.cgstPaise;
  if (key === "sgst") return line.sgstPaise;
  return line.cessPaise;
}

function lineHeads(line: ReturnLine, sign = 1): TaxHeads {
  return {
    igstPaise: sign * line.igstPaise,
    cgstPaise: sign * line.cgstPaise,
    sgstPaise: sign * line.sgstPaise,
    cessPaise: sign * line.cessPaise,
  };
}

/** Portal JSON wants rupee numbers with at most two decimals. */
function rupee(paise: number): number {
  return paise / 100;
}

function rate(bp: number): number {
  return bp / 100;
}

function portalDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
}

function documentNumber(number: string): string {
  return number.endsWith("~A") ? number.slice(0, -2) : number;
}

function signOf(doc: ReturnSalesDoc): number {
  return doc.docType === "credit_note" ? -1 : 1;
}

function isInterState(doc: ReturnSalesDoc, business: ReturnBusiness): boolean {
  return doc.isExport || doc.placeOfSupply !== business.stateCode;
}

function taxableLines(doc: ReturnSalesDoc): ReturnLine[] {
  return doc.lines.filter(
    (line) => line.supplyKind === "taxable" || line.supplyKind === "zero_rated",
  );
}

function hasTaxableLine(doc: ReturnSalesDoc): boolean {
  return taxableLines(doc).length > 0;
}

interface PortalItem {
  num: number;
  itm_det: {
    txval: number;
    rt: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
  };
}

function portalItems(doc: ReturnSalesDoc): PortalItem[] {
  const buckets = new Map<
    number,
    { txval: number; iamt: number; camt: number; samt: number; csamt: number }
  >();
  for (const line of doc.lines) {
    if (line.supplyKind !== "taxable" && line.supplyKind !== "zero_rated") {
      continue;
    }
    const bucket =
      buckets.get(line.gstRateBp) ??
      { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
    bucket.txval += line.taxableValuePaise;
    bucket.iamt += line.igstPaise;
    bucket.camt += line.cgstPaise;
    bucket.samt += line.sgstPaise;
    bucket.csamt += line.cessPaise;
    buckets.set(line.gstRateBp, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([gstRateBp, value], index) => ({
      num: index + 1,
      itm_det: {
        txval: rupee(value.txval),
        rt: rate(gstRateBp),
        iamt: rupee(value.iamt),
        camt: rupee(value.camt),
        samt: rupee(value.samt),
        csamt: rupee(value.csamt),
      },
    }));
}

interface HsnBucket {
  hsnSac: string;
  rateBp: number;
  uqc: string;
  description: string;
  qty: number;
  taxableValuePaise: number;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
}

function hsnBucketKey(line: ReturnLine): string {
  return `${line.hsnSac || "NA"}|${line.gstRateBp}|${line.unit || "NA"}`;
}

function emptyHsnBucket(line: ReturnLine): HsnBucket {
  return {
    hsnSac: line.hsnSac || "NA",
    rateBp: line.gstRateBp,
    uqc: line.unit || "NA",
    description: line.description || "",
    qty: 0,
    taxableValuePaise: 0,
    igstPaise: 0,
    cgstPaise: 0,
    sgstPaise: 0,
    cessPaise: 0,
  };
}

function hsnRows(bucket: Map<string, HsnBucket>): HsnRow[] {
  return [...bucket.values()]
    .sort((left, right) => {
      if (left.hsnSac !== right.hsnSac) return left.hsnSac < right.hsnSac ? -1 : 1;
      if (left.rateBp !== right.rateBp) return left.rateBp - right.rateBp;
      return left.uqc < right.uqc ? -1 : left.uqc > right.uqc ? 1 : 0;
    })
    .map((row, index) => ({
      num: index + 1,
      hsnSac: row.hsnSac,
      description: row.description.slice(0, 30),
      uqc: row.uqc,
      qty: row.qty,
      rateBp: row.rateBp,
      taxableValuePaise: row.taxableValuePaise,
      igstPaise: row.igstPaise,
      cgstPaise: row.cgstPaise,
      sgstPaise: row.sgstPaise,
      cessPaise: row.cessPaise,
    }));
}

export interface Gstr1Input {
  period: string;
  business: ReturnBusiness;
  docs: readonly ReturnSalesDoc[];
  originals: readonly ReturnSalesDoc[];
  cancelledNumbers: readonly string[];
}

const SECTION_LABELS: Record<string, string> = {
  b2b: "B2B invoices (4A)",
  b2ba: "B2B amendments (9A)",
  b2cl: "B2C large (5)",
  b2cla: "B2C large amendments (9A)",
  b2cs: "B2C small (7)",
  exp: "Exports (6A)",
  cdnr: "Credit/debit notes, registered (9B)",
  cdnra: "Note amendments (9C)",
  cdnur: "Credit/debit notes, unregistered (9B)",
};

export function buildGstr1(input: Gstr1Input): Gstr1Result {
  const { period, business, docs, originals, cancelledNumbers } = input;
  const originalById = new Map(originals.map((doc) => [doc.id, doc]));

  const b2b = new Map<string, Array<Record<string, unknown>>>();
  const b2ba = new Map<string, Array<Record<string, unknown>>>();
  const b2cl = new Map<string, Array<Record<string, unknown>>>();
  const b2cla = new Map<string, Array<Record<string, unknown>>>();
  const cdnr = new Map<string, Array<Record<string, unknown>>>();
  const cdnra = new Map<string, Array<Record<string, unknown>>>();
  const exp = new Map<string, Array<Record<string, unknown>>>();
  const cdnur: Array<Record<string, unknown>> = [];

  const b2cs = new Map<
    string,
    { inter: boolean; pos: string; rateBp: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }
  >();

  const nil = {
    INTRB2B: { expt_amt: 0, nil_amt: 0, ngsup_amt: 0 },
    INTRB2C: { expt_amt: 0, nil_amt: 0, ngsup_amt: 0 },
    INTRAB2B: { expt_amt: 0, nil_amt: 0, ngsup_amt: 0 },
    INTRAB2C: { expt_amt: 0, nil_amt: 0, ngsup_amt: 0 },
  };

  const hsn = { b2b: new Map<string, HsnBucket>(), b2c: new Map<string, HsnBucket>() };
  const counts = new Map<string, number>();
  const totals = new Map<
    string,
    { taxableValuePaise: number; igstPaise: number; cgstPaise: number; sgstPaise: number; cessPaise: number; totalPaise: number }
  >();
  const issues: ReturnIssue[] = [];
  const numbers = new Map<string, string[]>();

  const bump = (key: string, by = 1) => counts.set(key, (counts.get(key) ?? 0) + by);

  function totalFor(key: string) {
    let row = totals.get(key);
    if (!row) {
      row = {
        taxableValuePaise: 0,
        igstPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        cessPaise: 0,
        totalPaise: 0,
      };
      totals.set(key, row);
    }
    return row;
  }

  function appendGroup(
    group: Map<string, Array<Record<string, unknown>>>,
    key: string,
    value: Record<string, unknown>,
  ) {
    const list = group.get(key) ?? [];
    list.push(value);
    group.set(key, list);
  }

  for (const doc of docs) {
    const inter = isInterState(doc, business);
    const sign = signOf(doc);
    const section = doc.section;
    const amended = doc.amendsId !== null;
    const number = documentNumber(doc.number);
    if (!amended) {
      const list = numbers.get(doc.docType) ?? [];
      list.push(number);
      numbers.set(doc.docType, list);
    }
    const label = `${doc.docType.replace("_", " ")} ${doc.number}`;

    if (doc.partyGstin && !validateGstin(doc.partyGstin).ok) {
      issues.push({
        level: "error",
        docId: doc.id,
        message: `${label}: customer GSTIN is not valid`,
      });
    }
    for (const line of doc.lines) {
      if (!line.hsnSac) {
        issues.push({
          level: section === "b2b" || section === "cdnr" ? "error" : "warning",
          docId: doc.id,
          message: `${label}: a line has no HSN/SAC code`,
        });
        break;
      }
    }
    if (doc.totalPaise === 0) {
      issues.push({ level: "warning", docId: doc.id, message: `${label}: total is zero` });
    }
    if (doc.docType !== "invoice" && !doc.originalNumber) {
      issues.push({
        level: "error",
        docId: doc.id,
        message: `${label}: original invoice number is missing`,
      });
    }

    // Table 8: nil, exempt and non-GST outward supplies.
    for (const line of doc.lines) {
      if (line.supplyKind === "exempt" || line.supplyKind === "nil" || line.supplyKind === "non_gst") {
        const bucket = `${inter ? "INTR" : "INTRA"}${doc.partyGstin ? "B2B" : "B2C"}` as keyof typeof nil;
        const field =
          line.supplyKind === "exempt" ? "expt_amt" : line.supplyKind === "nil" ? "nil_amt" : "ngsup_amt";
        nil[bucket][field] += sign * line.taxableValuePaise;
      }
    }

    // Table 12: HSN summary. Amended documents are reported in 9A/9C only.
    if (!amended) {
      const bucket = hsn[doc.partyGstin ? "b2b" : "b2c"];
      for (const line of doc.lines) {
        const key = hsnBucketKey(line);
        const row = bucket.get(key) ?? emptyHsnBucket(line);
        row.qty += sign * line.qty;
        row.taxableValuePaise += sign * line.taxableValuePaise;
        row.igstPaise += sign * line.igstPaise;
        row.cgstPaise += sign * line.cgstPaise;
        row.sgstPaise += sign * line.sgstPaise;
        row.cessPaise += sign * line.cessPaise;
        bucket.set(key, row);
      }
    }

    if (!hasTaxableLine(doc)) {
      bump("nil");
      continue;
    }

    const tag = `${section}${amended ? "a" : ""}`;
    bump(tag);
    const total = totalFor(tag);
    const lines = taxableLines(doc);
    total.taxableValuePaise += lines.reduce((sum, line) => sum + line.taxableValuePaise, 0);
    total.igstPaise += lines.reduce((sum, line) => sum + line.igstPaise, 0);
    total.cgstPaise += lines.reduce((sum, line) => sum + line.cgstPaise, 0);
    total.sgstPaise += lines.reduce((sum, line) => sum + line.sgstPaise, 0);
    total.cessPaise += lines.reduce((sum, line) => sum + line.cessPaise, 0);
    total.totalPaise += doc.totalPaise;

    const original = amended && doc.amendsId !== null ? originalById.get(doc.amendsId) : undefined;
    const amendKeys = original
      ? { oinum: documentNumber(original.number), oidt: portalDate(original.date) }
      : {};

    if (section === "b2b") {
      appendGroup(amended ? b2ba : b2b, doc.partyGstin, {
        inum: number,
        idt: portalDate(doc.date),
        val: rupee(doc.totalPaise),
        pos: doc.placeOfSupply,
        rchrg: doc.reverseCharge ? "Y" : "N",
        inv_typ: "R",
        itms: portalItems(doc),
        ...amendKeys,
      });
    } else if (section === "b2cl") {
      appendGroup(amended ? b2cla : b2cl, doc.placeOfSupply, {
        inum: number,
        idt: portalDate(doc.date),
        val: rupee(doc.totalPaise),
        itms: portalItems(doc),
        ...amendKeys,
      });
    } else if (section === "exp") {
      const type = doc.exportWithIgst ? "WPAY" : "WOPAY";
      appendGroup(exp, type, {
        inum: number,
        idt: portalDate(doc.date),
        val: rupee(doc.totalPaise),
        itms: portalItems(doc).map((item) => ({
          txval: item.itm_det.txval,
          rt: item.itm_det.rt,
          iamt: item.itm_det.iamt,
          csamt: item.itm_det.csamt,
        })),
      });
    } else if (section === "cdnr") {
      const note: Record<string, unknown> = {
        ntty: doc.docType === "credit_note" ? "C" : "D",
        nt_num: number,
        nt_dt: portalDate(doc.date),
        val: rupee(doc.totalPaise),
        pos: doc.placeOfSupply,
        rchrg: doc.reverseCharge ? "Y" : "N",
        inv_typ: "R",
        itms: portalItems(doc),
      };
      if (original) {
        note.ont_num = documentNumber(original.number);
        note.ont_dt = portalDate(original.date);
      }
      appendGroup(amended ? cdnra : cdnr, doc.partyGstin, note);
    } else if (section === "cdnur") {
      cdnur.push({
        typ: doc.isExport ? (doc.exportWithIgst ? "EXPWP" : "EXPWOP") : "B2CL",
        ntty: doc.docType === "credit_note" ? "C" : "D",
        nt_num: number,
        nt_dt: portalDate(doc.date),
        val: rupee(doc.totalPaise),
        pos: doc.placeOfSupply,
        itms: portalItems(doc),
      });
    } else {
      for (const line of lines) {
        const key = `${inter ? "INTER" : "INTRA"}|${doc.placeOfSupply}|${line.gstRateBp}`;
        const row =
          b2cs.get(key) ??
          {
            inter,
            pos: doc.placeOfSupply,
            rateBp: line.gstRateBp,
            txval: 0,
            iamt: 0,
            camt: 0,
            samt: 0,
            csamt: 0,
          };
        row.txval += sign * line.taxableValuePaise;
        row.iamt += sign * line.igstPaise;
        row.camt += sign * line.cgstPaise;
        row.samt += sign * line.sgstPaise;
        row.csamt += sign * line.cessPaise;
        b2cs.set(key, row);
      }
    }
  }

  // Numbering checks.
  for (const [docType, list] of numbers) {
    if (list.length !== new Set(list).size) {
      issues.push({
        level: "error",
        message: `Duplicate ${docType.replace("_", " ")} numbers in this period`,
      });
    }
  }

  const cancelled = cancelledNumbers.length;
  const docDet: Array<Record<string, unknown>> = [];
  const numbering: Array<[number, ReturnDocType]> = [
    [1, "invoice"],
    [4, "debit_note"],
    [5, "credit_note"],
  ];
  for (const [docNum, docType] of numbering) {
    const list = [...(numbers.get(docType) ?? [])].sort();
    if (list.length === 0) {
      continue;
    }
    const cancel = docType === "invoice" ? cancelled : 0;
    docDet.push({
      doc_num: docNum,
      docs: [
        {
          num: 1,
          from: list[0],
          to: list[list.length - 1],
          totnum: list.length + cancel,
          cancel,
          net_issue: list.length,
        },
      ],
    });
  }

  const sortedGroups = (group: Map<string, Array<Record<string, unknown>>>) =>
    [...group.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, inv]) => ({ key, inv }));

  const b2csRows = [...b2cs.values()]
    .sort((left, right) => {
      const leftKey = `${left.inter ? "INTER" : "INTRA"}|${left.pos}|${String(left.rateBp).padStart(5, "0")}`;
      const rightKey = `${right.inter ? "INTER" : "INTRA"}|${right.pos}|${String(right.rateBp).padStart(5, "0")}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })
    .map((row) => {
      const record: Record<string, number | string> = {
        sply_ty: row.inter ? "INTER" : "INTRA",
        pos: row.pos,
        typ: "OE",
        rt: rate(row.rateBp),
        txval: rupee(row.txval),
        iamt: rupee(row.iamt),
        camt: rupee(row.camt),
        samt: rupee(row.samt),
        csamt: rupee(row.csamt),
      };
      // The portal omits the tax heads that cannot apply to the supply type.
      if (row.inter) {
        delete record.camt;
        delete record.samt;
      } else {
        delete record.iamt;
      }
      return record;
    });

  const payload: Record<string, unknown> = {
    gstin: business.gstin,
    fp: returnFp(period),
    version: "GST3.2",
    hash: "hash",
  };
  if (b2b.size > 0) {
    payload.b2b = sortedGroups(b2b).map(({ key, inv }) => ({ ctin: key, inv }));
  }
  if (b2ba.size > 0) {
    payload.b2ba = sortedGroups(b2ba).map(({ key, inv }) => ({ ctin: key, inv }));
  }
  if (b2cl.size > 0) {
    payload.b2cl = sortedGroups(b2cl).map(({ key, inv }) => ({ pos: key, inv }));
  }
  if (b2cla.size > 0) {
    payload.b2cla = sortedGroups(b2cla).map(({ key, inv }) => ({ pos: key, inv }));
  }
  if (b2csRows.length > 0) {
    payload.b2cs = b2csRows;
  }
  if (exp.size > 0) {
    payload.exp = sortedGroups(exp).map(({ key, inv }) => ({ exp_typ: key, inv }));
  }
  if (cdnr.size > 0) {
    payload.cdnr = sortedGroups(cdnr).map(({ key, inv }) => ({ ctin: key, nt: inv }));
  }
  if (cdnra.size > 0) {
    payload.cdnra = sortedGroups(cdnra).map(({ key, inv }) => ({ ctin: key, nt: inv }));
  }
  if (cdnur.length > 0) {
    payload.cdnur = cdnur;
  }

  const nilRows = (Object.keys(nil) as Array<keyof typeof nil>)
    .filter((key) => nil[key].expt_amt || nil[key].nil_amt || nil[key].ngsup_amt)
    .map((key) => ({
      sply_ty: key,
      expt_amt: rupee(nil[key].expt_amt),
      nil_amt: rupee(nil[key].nil_amt),
      ngsup_amt: rupee(nil[key].ngsup_amt),
    }));
  if (nilRows.length > 0) {
    payload.nil = { inv: nilRows };
  }

  const hsnOut = { b2b: hsnRows(hsn.b2b), b2c: hsnRows(hsn.b2c) };
  if (hsnOut.b2b.length > 0 || hsnOut.b2c.length > 0) {
    payload.hsn = {
      hsn_b2b: hsnOut.b2b.map((row) => ({
        num: row.num,
        hsn_sc: row.hsnSac,
        desc: row.description,
        user_desc: row.description,
        uqc: row.uqc,
        qty: row.qty,
        rt: rate(row.rateBp),
        txval: rupee(row.taxableValuePaise),
        iamt: rupee(row.igstPaise),
        camt: rupee(row.cgstPaise),
        samt: rupee(row.sgstPaise),
        csamt: rupee(row.cessPaise),
      })),
      hsn_b2c: hsnOut.b2c.map((row) => ({
        num: row.num,
        hsn_sc: row.hsnSac,
        desc: row.description,
        user_desc: row.description,
        uqc: row.uqc,
        qty: row.qty,
        rt: rate(row.rateBp),
        txval: rupee(row.taxableValuePaise),
        iamt: rupee(row.igstPaise),
        camt: rupee(row.cgstPaise),
        samt: rupee(row.sgstPaise),
        csamt: rupee(row.cessPaise),
      })),
    };
  }
  if (docDet.length > 0) {
    payload.doc_issue = { doc_det: docDet };
  }

  const b2csTotals = [...b2cs.values()].reduce(
    (sum, row) => ({
      taxableValuePaise: sum.taxableValuePaise + row.txval,
      igstPaise: sum.igstPaise + row.iamt,
      cgstPaise: sum.cgstPaise + row.camt,
      sgstPaise: sum.sgstPaise + row.samt,
      cessPaise: sum.cessPaise + row.csamt,
    }),
    { taxableValuePaise: 0, igstPaise: 0, cgstPaise: 0, sgstPaise: 0, cessPaise: 0 },
  );
  if (b2csRows.length > 0) {
    const total = totalFor("b2cs");
    total.taxableValuePaise = b2csTotals.taxableValuePaise;
    total.igstPaise = b2csTotals.igstPaise;
    total.cgstPaise = b2csTotals.cgstPaise;
    total.sgstPaise = b2csTotals.sgstPaise;
    total.cessPaise = b2csTotals.cessPaise;
    total.totalPaise =
      b2csTotals.taxableValuePaise +
      b2csTotals.igstPaise +
      b2csTotals.cgstPaise +
      b2csTotals.sgstPaise +
      b2csTotals.cessPaise;
  }

  if (!business.gstin) {
    issues.unshift({
      level: "error",
      message: "Business GSTIN is missing. Add it in Settings",
    });
  }

  const sectionOrder: Gstr1Section[] = [
    "b2b",
    "b2cl",
    "b2cs",
    "exp",
    "cdnr",
    "cdnur",
  ];
  const sections: Gstr1SectionRow[] = [];
  for (const section of sectionOrder) {
    for (const key of [section, `${section}a`]) {
      if (!SECTION_LABELS[key]) {
        continue;
      }
      const counted = counts.get(key) ?? 0;
      if (counted === 0) {
        continue;
      }
      const total = totals.get(key) ?? {
        taxableValuePaise: 0,
        igstPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        cessPaise: 0,
        totalPaise: 0,
      };
      sections.push({ key, label: SECTION_LABELS[key], count: counted, ...total });
    }
  }

  const nilTotals = (Object.keys(nil) as Array<keyof typeof nil>).reduce(
    (sum, key) => ({
      expt_amt: sum.expt_amt + nil[key].expt_amt,
      nil_amt: sum.nil_amt + nil[key].nil_amt,
      ngsup_amt: sum.ngsup_amt + nil[key].ngsup_amt,
    }),
    { expt_amt: 0, nil_amt: 0, ngsup_amt: 0 },
  );

  return {
    period,
    schemaVersion: SCHEMA_VERSION,
    payload,
    sections,
    nil: nilTotals,
    hsn: hsnOut,
    issues,
    docCount: docs.length,
  };
}

/** Utilise ITC per section 49 / rule 88A. Amounts are integer paise. */
export function setOff(liability: PlainHeads, credit: PlainHeads): SetOffResult {
  const liab = { ...liability };
  const cred = { ...credit };
  const used = {
    igst: { igst: 0, cgst: 0, sgst: 0 },
    cgst: { igst: 0, cgst: 0, sgst: 0 },
    sgst: { igst: 0, cgst: 0, sgst: 0 },
    cess: { cess: 0 },
  };
  const order: Record<string, ReadonlyArray<"igst" | "cgst" | "sgst">> = {
    igst: ["igst", "cgst", "sgst"],
    cgst: ["cgst", "igst"],
    sgst: ["sgst", "igst"],
  };
  for (const source of ["igst", "cgst", "sgst"] as const) {
    for (const target of order[source] ?? []) {
      const amount = Math.min(cred[source], liab[target]);
      if (amount > 0) {
        used[source][target] += amount;
        cred[source] -= amount;
        liab[target] -= amount;
      }
    }
  }
  const cessUsed = Math.min(cred.cess, liab.cess);
  used.cess.cess = cessUsed;
  cred.cess -= cessUsed;
  liab.cess -= cessUsed;

  return {
    itcUsed: used,
    cash: { igst: liab.igst, cgst: liab.cgst, sgst: liab.sgst, cess: liab.cess },
    balance: { igst: cred.igst, cgst: cred.cgst, sgst: cred.sgst, cess: cred.cess },
  };
}

export interface Gstr3bInput {
  period: string;
  business: ReturnBusiness;
  docs: readonly ReturnSalesDoc[];
  originals: readonly ReturnSalesDoc[];
  purchases: readonly ReturnPurchaseDoc[];
  adjustments: readonly ReturnAdjustment[];
  has2b: boolean;
  interestPaise?: number;
  lateFeePaise?: number;
}

function heads(value: { igstPaise?: number; cgstPaise?: number; sgstPaise?: number; cessPaise?: number }): TaxHeads {
  return {
    igstPaise: value.igstPaise ?? 0,
    cgstPaise: value.cgstPaise ?? 0,
    sgstPaise: value.sgstPaise ?? 0,
    cessPaise: value.cessPaise ?? 0,
  };
}

function sumOf(value: TaxHeads): number {
  return value.igstPaise + value.cgstPaise + value.sgstPaise + value.cessPaise;
}

function headsPayload(value: TaxHeads, withTaxable?: number): Record<string, number> {
  const row: Record<string, number> = {
    iamt: rupee(value.igstPaise),
    camt: rupee(value.cgstPaise),
    samt: rupee(value.sgstPaise),
    csamt: rupee(value.cessPaise),
  };
  if (withTaxable !== undefined) {
    row.txval = rupee(withTaxable);
  }
  return row;
}

function taxablePayload(value: TaxHeads, taxablePaise: number): Record<string, number> {
  return {
    txval: rupee(taxablePaise),
    iamt: rupee(value.igstPaise),
    camt: rupee(value.cgstPaise),
    samt: rupee(value.sgstPaise),
    csamt: rupee(value.cessPaise),
  };
}

function plain(value: TaxHeads): PlainHeads {
  return {
    igst: value.igstPaise,
    cgst: value.cgstPaise,
    sgst: value.sgstPaise,
    cess: value.cessPaise,
  };
}

function fromPlain(value: PlainHeads): TaxHeads {
  return {
    igstPaise: value.igst,
    cgstPaise: value.cgst,
    sgstPaise: value.sgst,
    cessPaise: value.cess,
  };
}

export function buildGstr3b(input: Gstr3bInput): Gstr3bResult {
  const { period, business, docs, originals, purchases, adjustments, has2b } = input;
  const originalById = new Map(originals.map((doc) => [doc.id, doc]));

  const osup = zeroHeads();
  let osupTaxable = 0;
  const zero = zeroHeads();
  let zeroTaxable = 0;
  let nilExempt = 0;
  let nonGst = 0;
  const unreg = new Map<string, { txval: number; iamt: number }>();
  let rcmOutNote = 0;

  const entries: Array<[ReturnSalesDoc, number]> = [];
  for (const doc of docs) {
    entries.push([doc, signOf(doc)]);
    if (doc.amendsId !== null) {
      const original = originalById.get(doc.amendsId);
      if (original) {
        entries.push([original, -signOf(original)]);
      }
    }
  }

  for (const [doc, sign] of entries) {
    const inter = isInterState(doc, business);
    for (const line of doc.lines) {
      if (doc.reverseCharge && line.supplyKind === "taxable") {
        rcmOutNote += sign * line.taxableValuePaise;
        continue;
      }
      if (line.supplyKind === "taxable") {
        osupTaxable += sign * line.taxableValuePaise;
        addHeads(osup, lineHeads(line), sign);
        if (inter && !doc.partyGstin) {
          const row = unreg.get(doc.placeOfSupply) ?? { txval: 0, iamt: 0 };
          row.txval += sign * line.taxableValuePaise;
          row.iamt += sign * line.igstPaise;
          unreg.set(doc.placeOfSupply, row);
        }
      } else if (line.supplyKind === "zero_rated") {
        zeroTaxable += sign * line.taxableValuePaise;
        addHeads(zero, lineHeads(line), sign);
      } else if (line.supplyKind === "nil" || line.supplyKind === "exempt") {
        nilExempt += sign * line.taxableValuePaise;
      } else {
        nonGst += sign * line.taxableValuePaise;
      }
    }
  }

  let rcmInTaxable = 0;
  const rcmIn = zeroHeads();
  const itcAllOther = zeroHeads();
  const itcRcm = zeroHeads();
  const inelig17_5 = zeroHeads();
  const deferred = zeroHeads();
  const deferredDocs: Array<{ id: number; number: string; supplier: string }> = [];
  const inwardExempt = { inter: 0, intra: 0 };
  const inwardNonGst = { inter: 0, intra: 0 };

  for (const doc of purchases) {
    const sign = doc.docType === "credit_note" ? -1 : 1;
    const inter = doc.supplierStateCode !== doc.placeOfSupply;
    const missing = has2b && !doc.reverseCharge && doc.reconStatus === "missing_in_2b";
    for (const line of doc.lines) {
      if (line.supplyKind === "exempt" || line.supplyKind === "nil") {
        inwardExempt[inter ? "inter" : "intra"] += sign * line.taxableValuePaise;
        continue;
      }
      if (line.supplyKind === "non_gst") {
        inwardNonGst[inter ? "inter" : "intra"] += sign * line.taxableValuePaise;
        continue;
      }
      const tax = lineHeads(line, sign);
      if (doc.reverseCharge) {
        rcmInTaxable += sign * line.taxableValuePaise;
        addHeads(rcmIn, tax);
        addHeads(itcRcm, tax);
        if (!line.itcEligible) {
          addHeads(inelig17_5, tax);
        }
        continue;
      }
      if (missing) {
        addHeads(deferred, tax);
        continue;
      }
      addHeads(itcAllOther, tax);
      if (!line.itcEligible) {
        addHeads(inelig17_5, tax);
      }
    }
    if (has2b && doc.reconStatus === "missing_in_2b" && !doc.reverseCharge) {
      deferredDocs.push({ id: doc.id, number: doc.number, supplier: doc.supplierName });
    }
  }

  const revRule = zeroHeads();
  const revOther = zeroHeads();
  const reclaim = zeroHeads();
  for (const adjustment of adjustments) {
    const tax = heads(adjustment);
    if (adjustment.kind === "reclaim") {
      addHeads(reclaim, tax);
    } else if (["rule42", "rule43", "sec17_5", "rule38"].includes(adjustment.rule)) {
      addHeads(revRule, tax);
    } else {
      addHeads(revOther, tax);
    }
  }

  const rev4b1 = addHeads(heads(inelig17_5), revRule);
  const itcAvailable = addHeads(heads(itcRcm), itcAllOther);
  const itcNet = heads(itcAvailable);
  addHeads(itcNet, rev4b1, -1);
  addHeads(itcNet, revOther, -1);

  const otherLiability = addHeads(heads(osup), zero);
  const positiveCredit = {
    igstPaise: Math.max(itcNet.igstPaise, 0),
    cgstPaise: Math.max(itcNet.cgstPaise, 0),
    sgstPaise: Math.max(itcNet.sgstPaise, 0),
    cessPaise: Math.max(itcNet.cessPaise, 0),
  };
  const offset = setOff(plain(otherLiability), plain(positiveCredit));
  const cash = fromPlain(offset.cash);
  addHeads(cash, rcmIn);

  const interestPaise = input.interestPaise ?? 0;
  const lateFeePaise = input.lateFeePaise ?? 0;
  const cashTotal = sumOf(cash) + interestPaise + lateFeePaise;

  const outputTax = sumOf(osup) + sumOf(zero) + sumOf(rcmIn);
  const eligibleItc = sumOf(itcNet);
  const netPayable = sumOf(cash);

  const tables: Gstr3bTable[] = [
    {
      key: "3.1(a)",
      label: "3.1(a) Outward taxable supplies",
      txvalPaise: osupTaxable,
      ...heads(osup),
    },
    {
      key: "3.1(b)",
      label: "3.1(b) Zero rated supplies",
      txvalPaise: zeroTaxable,
      ...heads(zero),
    },
    { key: "3.1(c)", label: "3.1(c) Nil rated and exempted", txvalPaise: nilExempt, ...zeroHeads() },
    {
      key: "3.1(d)",
      label: "3.1(d) Inward supplies on reverse charge",
      txvalPaise: rcmInTaxable,
      ...heads(rcmIn),
    },
    { key: "3.1(e)", label: "3.1(e) Non-GST outward supplies", txvalPaise: nonGst, ...zeroHeads() },
    { key: "4A(3)", label: "4A(3) ITC on reverse charge inward", ...heads(itcRcm) },
    { key: "4A(5)", label: "4A(5) All other ITC", ...heads(itcAllOther) },
    {
      key: "4B(1)",
      label: "4B(1) ITC reversed: rules 38, 42, 43 and section 17(5)",
      ...heads(rev4b1),
    },
    { key: "4B(2)", label: "4B(2) ITC reversed: others", ...heads(revOther) },
    { key: "4C", label: "4C Net ITC available", ...heads(itcNet) },
    { key: "4D(1)", label: "4D(1) ITC reclaimed", ...heads(reclaim) },
    {
      key: "5-inter",
      label: "5 Exempt, nil and non-GST inward (inter-state)",
      txvalPaise: inwardExempt.inter + inwardNonGst.inter,
      ...zeroHeads(),
    },
    {
      key: "5-intra",
      label: "5 Exempt, nil and non-GST inward (intra-state)",
      txvalPaise: inwardExempt.intra + inwardNonGst.intra,
      ...zeroHeads(),
    },
  ];

  const empty = headsPayload(zeroHeads());
  const zero4 = headsPayload(zeroHeads());
  const payload: Record<string, unknown> = {
    gstin: business.gstin,
    ret_period: returnFp(period),
    sup_details: {
      osup_det: taxablePayload(osup, osupTaxable),
      osup_zero: (() => {
        const row = taxablePayload(zero, zeroTaxable);
        delete row.camt;
        delete row.samt;
        return row;
      })(),
      osup_nil_exmp: { txval: rupee(nilExempt) },
      isup_rev: taxablePayload(rcmIn, rcmInTaxable),
      osup_nongst: { txval: rupee(nonGst) },
    },
    inter_sup: {
      unreg_details: [...unreg.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([pos, row]) => ({ pos, txval: rupee(row.txval), iamt: rupee(row.iamt) })),
      comp_details: [],
      uin_details: [],
    },
    itc_elg: {
      itc_avl: [
        { ty: "IMPG", ...empty },
        { ty: "IMPS", ...headsPayload(zeroHeads()) },
        { ty: "ISRC", ...headsPayload(itcRcm) },
        { ty: "ISD", ...zero4 },
        { ty: "OTH", ...headsPayload(itcAllOther) },
      ],
      itc_rev: [
        { ty: "RUL", ...headsPayload(rev4b1) },
        { ty: "OTH", ...headsPayload(revOther) },
      ],
      itc_net: headsPayload(itcNet),
      itc_inelg: [
        { ty: "RUL", ...headsPayload(reclaim) },
        { ty: "OTH", ...zero4 },
      ],
    },
    inward_sup: {
      isup_details: [
        { ty: "GST", inter: rupee(inwardExempt.inter), intra: rupee(inwardExempt.intra) },
        { ty: "NONGST", inter: rupee(inwardNonGst.inter), intra: rupee(inwardNonGst.intra) },
      ],
    },
    intr_ltfee: {
      intr_details: { iamt: 0, camt: 0, samt: 0, csamt: 0, intr: rupee(interestPaise) },
      ltfee_details: {
        cgst: rupee(Math.floor(lateFeePaise / 2)),
        sgst: rupee(lateFeePaise - Math.floor(lateFeePaise / 2)),
      },
    },
  };

  const notes: string[] = [];
  if (rcmOutNote !== 0) {
    notes.push(
      `Outward supplies on which the customer pays tax (reverse charge): ₹${formatINR(rcmOutNote)} taxable, not in 3.1(a)`,
    );
  }
  if (!has2b) {
    notes.push(
      "GSTR-2B has not been imported for this period, so ITC is taken from your purchase records. Import 2B to confirm it",
    );
  }

  return {
    period,
    schemaVersion: SCHEMA_VERSION,
    payload,
    has2b,
    tables,
    payment: {
      liability: addHeads(heads(otherLiability), rcmIn),
      rcmCash: heads(rcmIn),
      itcUsed: offset.itcUsed,
      cash,
      closingCredit: fromPlain(offset.balance),
      interestPaise,
      lateFeePaise,
      cashTotalPaise: cashTotal,
    },
    outputTaxPaise: outputTax,
    eligibleItcPaise: eligibleItc,
    netPayablePaise: netPayable,
    deferred,
    deferredDocs,
    notes,
  };
}

interface PortalNoteItem {
  itm_det?: Record<string, number>;
}

function notePaise(value: number | undefined): number {
  return Math.round((value ?? 0) * 100);
}

/** Compare GSTR-1 outward figures with GSTR-3B table 3.1, by tax head. */
export function compare1vs3b(g1: Gstr1Result, g3: Gstr3bResult): CompareRow[] {
  const out = { taxableValuePaise: 0, igstPaise: 0, cgstPaise: 0, sgstPaise: 0, cessPaise: 0 };
  for (const section of g1.sections) {
    if (section.key.endsWith("a")) {
      continue;
    }
    if (section.key === "cdnr" || section.key === "cdnur") {
      continue;
    }
    out.taxableValuePaise += section.taxableValuePaise;
    out.igstPaise += section.igstPaise;
    out.cgstPaise += section.cgstPaise;
    out.sgstPaise += section.sgstPaise;
    out.cessPaise += section.cessPaise;
  }

  const payload = g1.payload as {
    cdnr?: Array<{ nt: Array<{ ntty: string; itms: PortalNoteItem[] }> }>;
    cdnur?: Array<{ ntty: string; itms: PortalNoteItem[] }>;
  };
  for (const group of payload.cdnr ?? []) {
    for (const note of group.nt) {
      const sign = note.ntty === "C" ? -1 : 1;
      for (const item of note.itms) {
        const detail = item.itm_det ?? {};
        out.taxableValuePaise += sign * notePaise(detail.txval);
        out.igstPaise += sign * notePaise(detail.iamt);
        out.cgstPaise += sign * notePaise(detail.camt);
        out.sgstPaise += sign * notePaise(detail.samt);
        out.cessPaise += sign * notePaise(detail.csamt);
      }
    }
  }
  for (const note of payload.cdnur ?? []) {
    const sign = note.ntty === "C" ? -1 : 1;
    for (const item of note.itms) {
      const detail = item.itm_det ?? {};
      out.taxableValuePaise += sign * notePaise(detail.txval);
      out.igstPaise += sign * notePaise(detail.iamt);
      out.cessPaise += sign * notePaise(detail.csamt);
    }
  }

  const tableA = g3.tables.find((row) => row.key === "3.1(a)");
  const tableB = g3.tables.find((row) => row.key === "3.1(b)");
  const threeB = {
    taxableValuePaise: (tableA?.txvalPaise ?? 0) + (tableB?.txvalPaise ?? 0),
    igstPaise: (tableA?.igstPaise ?? 0) + (tableB?.igstPaise ?? 0),
    cgstPaise: (tableA?.cgstPaise ?? 0) + (tableB?.cgstPaise ?? 0),
    sgstPaise: (tableA?.sgstPaise ?? 0) + (tableB?.sgstPaise ?? 0),
    cessPaise: (tableA?.cessPaise ?? 0) + (tableB?.cessPaise ?? 0),
  };

  const rows: Array<{ head: string; key: keyof typeof out }> = [
    { head: "Taxable value", key: "taxableValuePaise" },
    { head: "IGST", key: "igstPaise" },
    { head: "CGST", key: "cgstPaise" },
    { head: "SGST", key: "sgstPaise" },
    { head: "Cess", key: "cessPaise" },
  ];
  return rows.map(({ head, key }) => ({
    head,
    gstr1Paise: out[key],
    gstr3bPaise: threeB[key],
    differencePaise: out[key] - threeB[key],
  }));
}
