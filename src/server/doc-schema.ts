/** Zod schemas for the sales and purchase APIs. Domain rules stay in `lib/docs`. */
import { z } from "zod";
import { SUPPLY_KINDS } from "@/lib/gst/gst";
import {
  DOC_TYPES,
  PRICE_MODES,
  PURCHASE_CATEGORIES,
} from "@/lib/docs";

export const lineSchema = z.object({
  description: z.string().max(500).optional(),
  hsnSac: z.string().max(20).optional(),
  qty: z.number().finite().positive(),
  unit: z.string().max(20).optional(),
  unitPricePaise: z.number().int().min(0),
  discountPaise: z.number().int().min(0).optional(),
  gstRateBp: z.number().int().min(0).max(10_000),
  cessRateBp: z.number().int().min(0).max(10_000).optional(),
  supplyKind: z.enum(SUPPLY_KINDS).optional(),
  itcEligible: z.boolean().optional(),
  itcReason: z.string().max(300).optional(),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-31");

const noteFields = {
  docType: z.enum(DOC_TYPES).optional(),
  originalNumber: z.string().max(40).optional(),
  originalDate: dateSchema.nullable().optional(),
  noteReason: z.string().max(500).optional(),
  notes: z.string().max(2_000).optional(),
};

export const salesSchema = z.object({
  ...noteFields,
  number: z.string().max(40),
  date: dateSchema,
  partyName: z.string().max(200),
  partyGstin: z.string().max(20).optional(),
  partyAddress: z.string().max(1_000).optional(),
  partyStateCode: z.string().max(2).optional(),
  placeOfSupply: z.string().max(2).optional(),
  reverseCharge: z.boolean().optional(),
  priceMode: z.enum(PRICE_MODES).optional(),
  roundOff: z.boolean().optional(),
  orderRef: z.string().max(100).optional(),
  isExport: z.boolean().optional(),
  exportWithIgst: z.boolean().optional(),
  partyId: z.number().int().positive().nullable().optional(),
  saveParty: z.boolean().optional(),
  lines: z.array(lineSchema).min(1).max(500),
});

export const purchaseSchema = z.object({
  ...noteFields,
  number: z.string().max(60),
  date: dateSchema,
  supplierName: z.string().max(200),
  supplierGstin: z.string().max(20).optional(),
  supplierStateCode: z.string().max(2).optional(),
  placeOfSupply: z.string().max(2).optional(),
  reverseCharge: z.boolean().optional(),
  priceMode: z.enum(PRICE_MODES).optional(),
  roundOff: z.boolean().optional(),
  category: z.enum(PURCHASE_CATEGORIES).optional(),
  itcPeriod: z.string().max(10).optional(),
  supplierId: z.number().int().positive().nullable().optional(),
  saveParty: z.boolean().optional(),
  lines: z.array(lineSchema).min(1).max(500),
});

export function intParam(value: string | null, fallback: number): number {
  if (value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function firstParam(...values: Array<string | null>): string {
  return values.find((value) => value !== null && value !== "") ?? "";
}
