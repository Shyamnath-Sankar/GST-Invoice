/**
 * GST calculation engine. Pure functions on integer paise and basis points.
 *
 * Rounding: each tax component is rounded half-up to the paisa per line.
 * Intra-state supplies split the rate equally into CGST and SGST; inter-state supplies carry IGST.
 */
import { BP_SCALE, divRoundHalfUp, roundHalfUp, taxPaise } from "../money";

export const SUPPLY_KINDS = [
  "taxable",
  "exempt",
  "nil",
  "non_gst",
  "zero_rated",
] as const;

export type SupplyKind = (typeof SUPPLY_KINDS)[number];

export const NON_TAXABLE_KINDS: readonly SupplyKind[] = ["exempt", "nil", "non_gst"];

export const GSTR1_SECTIONS = [
  "b2b",
  "b2cl",
  "b2cs",
  "exp",
  "cdnr",
  "cdnur",
] as const;

export type Gstr1Section = (typeof GSTR1_SECTIONS)[number];

export interface LineInput {
  qty: number;
  unitPricePaise: number;
  gstRateBp: number;
  discountPaise?: number;
  supplyKind?: SupplyKind;
  cessRateBp?: number;
  hsnSac?: string;
  description?: string;
  unit?: string;
}

export interface LineResult {
  grossPaise: number;
  discountPaise: number;
  taxableValuePaise: number;
  gstRateBp: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export interface RateBucket {
  gstRateBp: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
}

export interface DocumentResult {
  lines: LineResult[];
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  byRate: RateBucket[];
  byKind: Partial<Record<SupplyKind, number>>;
}

function qtyInThousandths(qty: number): number {
  if (!Number.isFinite(qty)) {
    throw new Error("Quantity must be a finite number");
  }
  return roundHalfUp(qty * 1000);
}

function splitTax(
  taxableValuePaise: number,
  rateBp: number,
  interState: boolean,
): { cgstPaise: number; sgstPaise: number; igstPaise: number } {
  if (interState) {
    return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise(taxableValuePaise, rateBp) };
  }
  const half = divRoundHalfUp(taxableValuePaise * rateBp, 2 * BP_SCALE);
  return { cgstPaise: half, sgstPaise: half, igstPaise: 0 };
}

export function calcLine(
  line: LineInput,
  options: { inclusive: boolean; interState: boolean },
): LineResult {
  const kind = line.supplyKind ?? "taxable";
  if (!SUPPLY_KINDS.includes(kind)) {
    throw new Error(`Unknown supply kind ${String(kind)}`);
  }
  if (!Number.isFinite(line.unitPricePaise)) {
    throw new Error("Unit price must be a finite number");
  }
  if (!Number.isInteger(line.unitPricePaise)) {
    throw new Error("Unit price must be integer paise");
  }

  const nonTaxable = NON_TAXABLE_KINDS.includes(kind);
  const rateBp = nonTaxable ? 0 : line.gstRateBp;
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > BP_SCALE) {
    throw new Error("GST rate must be between 0 and 100");
  }
  const cessRateBp = nonTaxable ? 0 : (line.cessRateBp ?? 0);
  if (!Number.isInteger(cessRateBp) || cessRateBp < 0 || cessRateBp > BP_SCALE) {
    throw new Error("Cess rate must be between 0 and 100");
  }

  const grossPaise = divRoundHalfUp(qtyInThousandths(line.qty) * line.unitPricePaise, 1000);
  const discountPaise = line.discountPaise ?? 0;
  if (!Number.isInteger(discountPaise) || discountPaise < 0) {
    throw new Error("Discount must be a non-negative integer number of paise");
  }
  if (discountPaise > grossPaise) {
    throw new Error("Discount cannot exceed the line amount");
  }
  const netPaise = grossPaise - discountPaise;

  let taxableValuePaise: number;
  let cgstPaise: number;
  let sgstPaise: number;
  let igstPaise: number;
  let cessPaise: number;

  if (options.inclusive && (rateBp > 0 || cessRateBp > 0)) {
    taxableValuePaise = divRoundHalfUp(
      netPaise * BP_SCALE,
      BP_SCALE + rateBp + cessRateBp,
    );
    const split = splitTax(taxableValuePaise, rateBp, options.interState);
    cgstPaise = split.cgstPaise;
    sgstPaise = split.sgstPaise;
    igstPaise = split.igstPaise;
    cessPaise = taxPaise(taxableValuePaise, cessRateBp);
    // Absorb the paise difference in taxable value so the line total equals what was charged.
    taxableValuePaise = netPaise - (cgstPaise + sgstPaise + igstPaise + cessPaise);
  } else {
    taxableValuePaise = netPaise;
    const split = splitTax(taxableValuePaise, rateBp, options.interState);
    cgstPaise = split.cgstPaise;
    sgstPaise = split.sgstPaise;
    igstPaise = split.igstPaise;
    cessPaise = taxPaise(taxableValuePaise, cessRateBp);
  }

  const tax = cgstPaise + sgstPaise + igstPaise + cessPaise;
  const totalPaise = taxableValuePaise + tax;

  return {
    grossPaise,
    discountPaise,
    taxableValuePaise,
    gstRateBp: rateBp,
    cgstPaise,
    sgstPaise,
    igstPaise,
    cessPaise,
    taxPaise: tax,
    totalPaise,
  };
}

export function calcDocument(
  lines: readonly LineInput[],
  options: { inclusive: boolean; interState: boolean; roundOff?: boolean },
): DocumentResult {
  const results = lines.map((line) =>
    calcLine(line, { inclusive: options.inclusive, interState: options.interState }),
  );

  const buckets = new Map<number, RateBucket>();
  const byKind: Partial<Record<SupplyKind, number>> = {};
  let taxableValuePaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  let cessPaise = 0;

  lines.forEach((input, index) => {
    const result = results[index];
    if (!result) {
      return;
    }
    const kind = input.supplyKind ?? "taxable";
    taxableValuePaise += result.taxableValuePaise;
    cgstPaise += result.cgstPaise;
    sgstPaise += result.sgstPaise;
    igstPaise += result.igstPaise;
    cessPaise += result.cessPaise;

    if (kind === "taxable" || kind === "zero_rated") {
      const bucket = buckets.get(result.gstRateBp) ?? {
        gstRateBp: result.gstRateBp,
        taxableValuePaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        cessPaise: 0,
      };
      bucket.taxableValuePaise += result.taxableValuePaise;
      bucket.cgstPaise += result.cgstPaise;
      bucket.sgstPaise += result.sgstPaise;
      bucket.igstPaise += result.igstPaise;
      bucket.cessPaise += result.cessPaise;
      buckets.set(result.gstRateBp, bucket);
    }

    byKind[kind] = (byKind[kind] ?? 0) + result.taxableValuePaise;
  });

  const exact = taxableValuePaise + cgstPaise + sgstPaise + igstPaise + cessPaise;
  const totalPaise = options.roundOff ? divRoundHalfUp(exact, 100) * 100 : exact;

  return {
    lines: results,
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    cessPaise,
    roundOffPaise: totalPaise - exact,
    totalPaise,
    byRate: [...buckets.values()].sort((a, b) => a.gstRateBp - b.gstRateBp),
    byKind,
  };
}

export interface ClassifyInput {
  docType: "invoice" | "credit_note" | "debit_note";
  partyGstin?: string | null;
  interState: boolean;
  totalPaise: number;
  b2clLimitPaise: number;
  isExport?: boolean;
}

/** The GSTR-1 section a sales document belongs to. */
export function classifySalesDoc(input: ClassifyInput): Gstr1Section {
  const registered = Boolean((input.partyGstin ?? "").trim());

  if (input.docType === "invoice") {
    if (input.isExport) {
      return "exp";
    }
    if (registered) {
      return "b2b";
    }
    if (input.interState && input.totalPaise > input.b2clLimitPaise) {
      return "b2cl";
    }
    return "b2cs";
  }

  if (registered) {
    return "cdnr";
  }
  if (input.isExport || (input.interState && input.totalPaise > input.b2clLimitPaise)) {
    return "cdnur";
  }
  return "b2cs";
}
