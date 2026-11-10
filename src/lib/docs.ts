/**
 * Sales and purchase document rules. Framework-free so a route, a script or a
 * unit test can call the same code. Amounts are integer paise and rates are
 * integer basis points. Every total comes from the GST engine.
 */
import {
  calcDocument,
  classifySalesDoc,
  SUPPLY_KINDS,
  type Gstr1Section,
  type LineInput,
  type LineResult,
  type SupplyKind,
} from "./gst/gst";
import { isValidHsnCode, isValidUqc } from "./gst/hsn";
import { normaliseGstin, stateFromGstin, STATES, validateGstin } from "./gst/gstin";
import { isMonthlyKey, isQuarterKey, monthKey, parseDate, quarterKey } from "./gst/periods";
import { amountInWords } from "./words";

export { amountInWords };

export const DOC_TYPES = ["invoice", "credit_note", "debit_note"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const PRICE_MODES = ["exclusive", "inclusive"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

export const PURCHASE_CATEGORIES = [
  "inputs",
  "input_services",
  "capital_goods",
  "expense",
] as const;
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

export const NO_ITC_REASON =
  "Outward supply taxed at 5% without ITC (Notification 11/2017-CT(Rate), entry 7)";
export const BLOCKED_ITC_REASON = "Blocked under section 17(5) or not used for business";

export interface DocBusiness {
  stateCode: string;
  defaultPriceMode: PriceMode;
  roundOff: boolean;
  b2clLimitPaise: number;
  noItcScheme: boolean;
}

export interface DocLineInput {
  description?: string;
  hsnSac?: string;
  qty: number;
  unit?: string;
  unitPricePaise: number;
  discountPaise?: number;
  gstRateBp: number;
  cessRateBp?: number;
  supplyKind?: SupplyKind;
  itcEligible?: boolean;
  itcReason?: string;
}

export interface BuiltLine {
  position: number;
  description: string;
  hsnSac: string;
  qty: number;
  unit: string;
  unitPricePaise: number;
  discountPaise: number;
  gstRateBp: number;
  cessRateBp: number;
  supplyKind: SupplyKind;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
  itcEligible?: boolean;
  itcReason?: string;
}

interface Totals {
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

export interface SalesInput {
  docType?: DocType;
  number: string;
  date: string;
  partyName: string;
  partyGstin?: string;
  partyAddress?: string;
  partyStateCode?: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  priceMode?: PriceMode;
  roundOff?: boolean;
  notes?: string;
  orderRef?: string;
  isExport?: boolean;
  exportWithIgst?: boolean;
  originalNumber?: string;
  originalDate?: string | null;
  noteReason?: string;
  lines: readonly DocLineInput[];
}

export interface BuiltSalesDoc extends Totals {
  docType: DocType;
  number: string;
  date: string;
  partyName: string;
  partyGstin: string;
  partyAddress: string;
  partyStateCode: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  priceMode: PriceMode;
  isExport: boolean;
  exportWithIgst: boolean;
  section: Gstr1Section;
  notes: string;
  orderRef: string;
  originalNumber: string;
  originalDate: string | null;
  noteReason: string;
  lines: BuiltLine[];
}

export interface PurchaseInput {
  docType?: DocType;
  number: string;
  date: string;
  supplierName: string;
  supplierGstin?: string;
  supplierStateCode?: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  priceMode?: PriceMode;
  roundOff?: boolean;
  category?: PurchaseCategory;
  itcPeriod?: string;
  notes?: string;
  originalNumber?: string;
  originalDate?: string | null;
  noteReason?: string;
  lines: readonly DocLineInput[];
}

export interface BuiltPurchaseDoc extends Totals {
  docType: DocType;
  number: string;
  date: string;
  supplierName: string;
  supplierGstin: string;
  supplierStateCode: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  priceMode: PriceMode;
  category: PurchaseCategory;
  itcPeriod: string;
  notes: string;
  originalNumber: string;
  originalDate: string | null;
  noteReason: string;
  lines: BuiltLine[];
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function fail(message: string): never {
  throw new Error(message);
}

function assertDate(date: string): void {
  parseDate(date);
}

function assertInteger(
  value: number,
  label: string,
  minimum: number,
  maximum?: number,
): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    fail(`${label} must be a whole number`);
  }
  if (value < minimum) {
    fail(`${label} cannot be less than ${minimum}`);
  }
  if (maximum !== undefined && value > maximum) {
    fail(`${label} cannot be more than ${maximum}`);
  }
  return value;
}

function assertState(code: string, label: string): string {
  if (!(code in STATES)) {
    fail(`${label}: choose a valid state`);
  }
  return code;
}

function assertGstin(value: string, label: string): string {
  const gstin = normaliseGstin(value);
  if (gstin) {
    const check = validateGstin(gstin);
    if (!check.ok) {
      fail(`${label}: ${check.error}`);
    }
  }
  return gstin;
}

function prepareLines(lines: readonly DocLineInput[]): LineInput[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    fail("Add at least one line");
  }
  if (lines.length > 500) {
    fail("A document can have at most 500 lines");
  }

  return lines.map((line, index) => {
    const position = index + 1;
    const qty = line.qty;
    if (!Number.isFinite(qty) || qty <= 0) {
      fail(`Line ${position}: quantity must be more than zero`);
    }
    const unitPricePaise = assertInteger(line.unitPricePaise, `Line ${position}: rate`, 0);
    const gstRateBp = assertInteger(line.gstRateBp, `Line ${position}: GST rate`, 0, 10_000);
    const cessRateBp = assertInteger(
      line.cessRateBp ?? 0,
      `Line ${position}: cess rate`,
      0,
      10_000,
    );
    const discountPaise = assertInteger(
      line.discountPaise ?? 0,
      `Line ${position}: discount`,
      0,
    );
    const supplyKind = line.supplyKind ?? "taxable";
    if (!SUPPLY_KINDS.includes(supplyKind)) {
      fail(`Line ${position}: unknown supply kind`);
    }
    const hsnSac = text(line.hsnSac);
    if (hsnSac && !isValidHsnCode(hsnSac)) {
      fail(`Line ${position}: HSN/SAC should be 4, 6 or 8 digits`);
    }
    const unit = (text(line.unit) || "NOS").toUpperCase();
    if (!isValidUqc(unit)) {
      fail(`Line ${position}: choose a valid unit (UQC)`);
    }

    return {
      qty,
      unitPricePaise,
      gstRateBp,
      cessRateBp,
      discountPaise,
      supplyKind,
      hsnSac,
      description: text(line.description),
      unit,
    };
  });
}

function copyLines(
  inputs: readonly LineInput[],
  raw: readonly DocLineInput[],
  results: readonly LineResult[],
  itc?: (
    line: LineResult,
    source: DocLineInput,
  ) => { eligible: boolean; reason: string },
): BuiltLine[] {
  return results.map((result, index) => {
    const source = raw[index];
    const input = inputs[index];
    if (!source || !input) {
      fail("Line data is incomplete");
    }
    const line: BuiltLine = {
      position: index,
      description: input.description ?? "",
      hsnSac: input.hsnSac ?? "",
      qty: input.qty,
      unit: input.unit ?? "NOS",
      unitPricePaise: input.unitPricePaise,
      discountPaise: result.discountPaise,
      gstRateBp: result.gstRateBp,
      cessRateBp: input.cessRateBp ?? 0,
      supplyKind: result.supplyKind,
      taxableValuePaise: result.taxableValuePaise,
      cgstPaise: result.cgstPaise,
      sgstPaise: result.sgstPaise,
      igstPaise: result.igstPaise,
      cessPaise: result.cessPaise,
      totalPaise: result.totalPaise,
    };
    if (itc) {
      const decision = itc(result, source);
      line.itcEligible = decision.eligible;
      line.itcReason = decision.reason;
    }
    return line;
  });
}

function totals(
  result: ReturnType<typeof calcDocument>,
): Totals {
  return {
    taxableValuePaise: result.taxableValuePaise,
    cgstPaise: result.cgstPaise,
    sgstPaise: result.sgstPaise,
    igstPaise: result.igstPaise,
    cessPaise: result.cessPaise,
    roundOffPaise: result.roundOffPaise,
    totalPaise: result.totalPaise,
  };
}

export function buildSalesDoc(raw: SalesInput, business: DocBusiness): BuiltSalesDoc {
  const docType = raw.docType ?? "invoice";
  if (!DOC_TYPES.includes(docType)) {
    fail("Unknown document type");
  }
  const number = text(raw.number);
  if (!number) {
    fail("Invoice number is required");
  }
  if (number.length > 16) {
    fail("GST allows at most 16 characters in an invoice number");
  }
  assertDate(raw.date);

  const partyName = text(raw.partyName);
  if (!partyName) {
    fail("Customer name is required");
  }
  const partyGstin = assertGstin(raw.partyGstin ?? "", "Customer GSTIN");
  const partyStateCode = assertState(
    text(raw.partyStateCode) || stateFromGstin(partyGstin) || business.stateCode,
    "Customer state",
  );
  if (partyGstin && partyGstin.slice(0, 2) !== partyStateCode) {
    fail("Customer state does not match the GSTIN");
  }

  const isExport = Boolean(raw.isExport);
  const exportWithIgst = Boolean(raw.exportWithIgst);
  const placeOfSupply = assertState(
    isExport ? "96" : text(raw.placeOfSupply) || partyStateCode || business.stateCode,
    "Place of supply",
  );
  const priceMode = raw.priceMode ?? business.defaultPriceMode;
  if (!PRICE_MODES.includes(priceMode)) {
    fail("Price mode must be exclusive or inclusive");
  }
  const originalNumber = text(raw.originalNumber);
  if (docType !== "invoice" && !originalNumber) {
    fail("Credit and debit notes need the original invoice number");
  }

  const inputs = prepareLines(raw.lines);
  const interState = isExport || placeOfSupply !== business.stateCode;
  const result = calcDocument(inputs, {
    inclusive: priceMode === "inclusive",
    interState,
    isExport,
    exportWithIgst,
    roundOff: raw.roundOff ?? business.roundOff,
  });
  const section = classifySalesDoc({
    docType,
    partyGstin,
    interState,
    totalPaise: result.totalPaise,
    b2clLimitPaise: business.b2clLimitPaise,
    isExport,
  });

  return {
    docType,
    number,
    date: raw.date,
    partyName,
    partyGstin,
    partyAddress: raw.partyAddress ?? "",
    partyStateCode,
    placeOfSupply,
    reverseCharge: Boolean(raw.reverseCharge),
    priceMode,
    isExport,
    exportWithIgst,
    section,
    notes: raw.notes ?? "",
    orderRef: text(raw.orderRef),
    originalNumber,
    originalDate: raw.originalDate ?? null,
    noteReason: raw.noteReason ?? "",
    lines: copyLines(inputs, raw.lines, result.lines),
    ...totals(result),
  };
}

export function defaultItc(
  noItcScheme: boolean,
  category: PurchaseCategory,
  taxPaise: number,
): { eligible: boolean; reason: string } {
  if (taxPaise <= 0) {
    return { eligible: false, reason: "No GST charged" };
  }
  if (category === "expense") {
    return { eligible: false, reason: BLOCKED_ITC_REASON };
  }
  if (noItcScheme) {
    return { eligible: false, reason: NO_ITC_REASON };
  }
  return { eligible: true, reason: "" };
}

export function buildPurchaseDoc(
  raw: PurchaseInput,
  business: DocBusiness,
): BuiltPurchaseDoc {
  const docType = raw.docType ?? "invoice";
  if (!DOC_TYPES.includes(docType)) {
    fail("Unknown document type");
  }
  const number = text(raw.number);
  if (!number) {
    fail("Supplier invoice number is required");
  }
  assertDate(raw.date);

  const supplierName = text(raw.supplierName);
  if (!supplierName) {
    fail("Supplier name is required");
  }
  const supplierGstin = assertGstin(raw.supplierGstin ?? "", "Supplier GSTIN");
  const supplierStateCode = assertState(
    text(raw.supplierStateCode) || stateFromGstin(supplierGstin) || business.stateCode,
    "Supplier state",
  );
  if (supplierGstin && supplierGstin.slice(0, 2) !== supplierStateCode) {
    fail("Supplier state does not match the GSTIN");
  }
  const placeOfSupply = assertState(
    text(raw.placeOfSupply) || business.stateCode,
    "Place of supply",
  );

  const priceMode = raw.priceMode ?? "exclusive";
  if (!PRICE_MODES.includes(priceMode)) {
    fail("Price mode must be exclusive or inclusive");
  }
  const category = raw.category ?? "inputs";
  if (!PURCHASE_CATEGORIES.includes(category)) {
    fail("Unknown purchase category");
  }
  const itcPeriod = text(raw.itcPeriod) || monthKey(raw.date);
  if (!isMonthlyKey(itcPeriod) && !isQuarterKey(itcPeriod)) {
    fail("ITC period must look like 2026-10 or 2026-Q3");
  }

  const inputs = prepareLines(raw.lines);
  const interState = supplierStateCode !== placeOfSupply;
  const result = calcDocument(inputs, {
    inclusive: priceMode === "inclusive",
    interState,
    roundOff: raw.roundOff ?? false,
  });

  const lines = copyLines(inputs, raw.lines, result.lines, (line, source) => {
    const fallback = defaultItc(business.noItcScheme, category, line.taxPaise);
    return fallbackWithOverride(source, fallback, line.taxPaise);
  });

  return {
    docType,
    number,
    date: raw.date,
    supplierName,
    supplierGstin,
    supplierStateCode,
    placeOfSupply,
    reverseCharge: Boolean(raw.reverseCharge),
    priceMode,
    category,
    itcPeriod,
    notes: raw.notes ?? "",
    originalNumber: text(raw.originalNumber),
    originalDate: raw.originalDate ?? null,
    noteReason: raw.noteReason ?? "",
    lines,
    ...totals(result),
  };
}

function fallbackWithOverride(
  source: DocLineInput | undefined,
  fallback: { eligible: boolean; reason: string },
  taxPaise: number,
): { eligible: boolean; reason: string } {
  if (source && source.itcEligible !== undefined && taxPaise > 0) {
    return {
      eligible: source.itcEligible,
      reason: text(source.itcReason) || (source.itcEligible ? "" : "Marked ineligible"),
    };
  }
  return fallback;
}

export interface ItcLine {
  itcEligible?: boolean;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
}

/** Tax split between eligible and ineligible ITC, per component. */
export function itcTotals(lines: readonly ItcLine[]): {
  eligible: { igstPaise: number; cgstPaise: number; sgstPaise: number; cessPaise: number };
  ineligible: { igstPaise: number; cgstPaise: number; sgstPaise: number; cessPaise: number };
} {
  const empty = () => ({ igstPaise: 0, cgstPaise: 0, sgstPaise: 0, cessPaise: 0 });
  const eligible = empty();
  const ineligible = empty();
  for (const line of lines) {
    const bucket = line.itcEligible ? eligible : ineligible;
    bucket.igstPaise += line.igstPaise;
    bucket.cgstPaise += line.cgstPaise;
    bucket.sgstPaise += line.sgstPaise;
    bucket.cessPaise += line.cessPaise;
  }
  return { eligible, ineligible };
}

/** The first filed-and-locked period covering this date, if any. */
export function lockedPeriodFor(
  date: string,
  lockedPeriods: readonly string[],
): string | null {
  const keys = new Set([monthKey(date), quarterKey(date)]);
  return lockedPeriods.find((period) => keys.has(period)) ?? null;
}

/** The next invoice/note number in the current financial-year series. */
export function nextDocumentNumber(
  docType: DocType,
  invoicePrefix: string,
  fy: string,
  existingNumbers: readonly string[],
): string {
  const prefix =
    docType === "invoice" ? invoicePrefix : docType === "credit_note" ? "CN/" : "DN/";
  const stem = `${prefix}${fy.slice(2, 4)}-${fy.slice(5)}/`;
  let highest = 0;
  for (const number of existingNumbers) {
    if (!number.startsWith(stem)) {
      continue;
    }
    const match = /(\d+)$/.exec(number.slice(stem.length));
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `${stem}${String(highest + 1).padStart(3, "0")}`;
}

/** Today in `YYYY-MM-DD`, UTC, matching the date columns. */
export function isoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A bill may be dated tomorrow to allow for time zones, but no later. */
export function isFutureDate(date: string, today: string = isoToday()): boolean {
  const limit = new Date(`${today}T00:00:00.000Z`);
  limit.setUTCDate(limit.getUTCDate() + 1);
  return date > limit.toISOString().slice(0, 10);
}
