/**
 * The business profile, the metadata a form needs, and GSTIN checks.
 * Every mutation writes an audit row; route handlers enforce the owner role.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  business,
  type FilingFrequency,
  type PriceMode,
  type RegistrationType,
} from "@/db/schema";
import { SUPPLY_KINDS } from "@/lib/gst/gst";
import {
  normaliseGstin,
  stateFromGstin,
  STATES,
  validateGstin,
  validatePan,
} from "@/lib/gst/gstin";
import { UQC } from "@/lib/gst/hsn";
import { fyOf, periodKey, periodLabel, periodsForFy, type Frequency } from "@/lib/gst/periods";
import type { Actor } from "./actor";
import type { TaxRateRow } from "./tax-rate-service";
import { listTaxRates } from "./tax-rate-service";
import { ApiError } from "./errors";
import { audit } from "./audit";

export type BusinessRow = typeof business.$inferSelect;

export interface BusinessInput {
  legalName?: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  stateCode?: string;
  jurisdiction?: string;
  registrationType?: RegistrationType;
  filingFrequency?: FilingFrequency;
  fyStartYear?: number;
  phone?: string;
  email?: string;
  proprietor?: string;
  invoicePrefix?: string;
  b2clLimitPaise?: number;
  noItcScheme?: boolean;
  roundOff?: boolean;
  defaultPriceMode?: PriceMode;
}

export interface Meta {
  states: Array<{ code: string; name: string }>;
  uqc: readonly string[];
  supplyKinds: readonly string[];
  rates: TaxRateRow[];
  currentFy: string;
  currentPeriod: string;
  periods: Array<{ key: string; label: string }>;
  previousPeriods: Array<{ key: string; label: string }>;
}

function text(value: string): string {
  return value.trim();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The single business row, created with defaults the first time it is read. */
export async function getBusiness(db: Db): Promise<BusinessRow> {
  const [existing] = await db.select().from(business).where(eq(business.id, 1)).limit(1);
  if (existing) {
    return existing;
  }
  await db.insert(business).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db.select().from(business).where(eq(business.id, 1)).limit(1);
  if (!created) {
    throw new ApiError(500, "Could not create the business row");
  }
  return created;
}

export async function updateBusiness(
  db: Db,
  actor: Actor,
  input: BusinessInput,
): Promise<BusinessRow> {
  const current = await getBusiness(db);
  const provided = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as BusinessInput;
  const merged: BusinessRow = { ...current, ...provided };

  merged.gstin = normaliseGstin(merged.gstin);
  merged.pan = text(merged.pan).toUpperCase();
  if (merged.gstin) {
    const check = validateGstin(merged.gstin);
    if (!check.ok) {
      throw new ApiError(422, `GSTIN: ${check.error}`);
    }
    if (merged.gstin.slice(0, 2) !== merged.stateCode) {
      throw new ApiError(422, "The state does not match the first two digits of the GSTIN");
    }
    if (merged.pan && merged.gstin.slice(2, 12) !== merged.pan) {
      throw new ApiError(422, "The PAN does not match characters 3 to 12 of the GSTIN");
    }
    merged.pan = merged.pan || merged.gstin.slice(2, 12);
  }
  if (merged.pan) {
    const check = validatePan(merged.pan);
    if (!check.ok) {
      throw new ApiError(422, check.error);
    }
  }

  if (!(merged.stateCode in STATES)) {
    throw new ApiError(422, "Choose a valid state");
  }
  if (merged.registrationType !== "regular" && merged.registrationType !== "composition") {
    throw new ApiError(422, "Registration type must be regular or composition");
  }
  if (merged.filingFrequency !== "monthly" && merged.filingFrequency !== "quarterly") {
    throw new ApiError(422, "Filing frequency must be monthly or quarterly");
  }
  if (merged.defaultPriceMode !== "exclusive" && merged.defaultPriceMode !== "inclusive") {
    throw new ApiError(422, "Price mode must be exclusive or inclusive");
  }
  if (
    !Number.isInteger(merged.fyStartYear) ||
    merged.fyStartYear < 2000 ||
    merged.fyStartYear > 2100
  ) {
    throw new ApiError(422, "The financial year must be a year like 2026");
  }
  if (!Number.isInteger(merged.b2clLimitPaise) || merged.b2clLimitPaise < 0) {
    throw new ApiError(422, "The B2CL limit must be zero or more paise");
  }

  merged.legalName = text(merged.legalName);
  merged.tradeName = text(merged.tradeName);
  merged.address = text(merged.address);
  merged.jurisdiction = text(merged.jurisdiction);
  merged.phone = text(merged.phone);
  merged.email = text(merged.email);
  merged.proprietor = text(merged.proprietor);
  merged.invoicePrefix = text(merged.invoicePrefix);

  const [updated] = await db
    .update(business)
    .set({
      legalName: merged.legalName,
      tradeName: merged.tradeName,
      gstin: merged.gstin,
      pan: merged.pan,
      address: merged.address,
      stateCode: merged.stateCode,
      jurisdiction: merged.jurisdiction,
      registrationType: merged.registrationType,
      filingFrequency: merged.filingFrequency,
      fyStartYear: merged.fyStartYear,
      phone: merged.phone,
      email: merged.email,
      proprietor: merged.proprietor,
      invoicePrefix: merged.invoicePrefix,
      b2clLimitPaise: merged.b2clLimitPaise,
      noItcScheme: merged.noItcScheme,
      roundOff: merged.roundOff,
      defaultPriceMode: merged.defaultPriceMode,
      updatedAt: new Date(),
    })
    .where(eq(business.id, 1))
    .returning();

  if (!updated) {
    throw new ApiError(500, "Could not save the business details");
  }

  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "update",
    entityType: "business",
    entityId: 1,
    summary: "Updated business and GST settings",
    before: current,
    after: updated,
  });
  return updated;
}

export async function getMeta(db: Db, today: string = todayIso()): Promise<Meta> {
  const settings = await getBusiness(db);
  const frequency = settings.filingFrequency as Frequency;
  const currentFy = fyOf(today);
  const startYear = Number(currentFy.slice(0, 4));
  const previousFy = `${startYear - 1}-${String(startYear).slice(2)}`;

  return {
    states: Object.entries(STATES).map(([code, name]) => ({ code, name })),
    uqc: UQC,
    supplyKinds: SUPPLY_KINDS,
    rates: await listTaxRates(db),
    currentFy,
    currentPeriod: periodKey(today, frequency),
    periods: periodsForFy(currentFy, frequency).map((key) => ({
      key,
      label: periodLabel(key),
    })),
    previousPeriods: periodsForFy(previousFy, frequency).map((key) => ({
      key,
      label: periodLabel(key),
    })),
  };
}

export function checkGstin(value: string | null | undefined): {
  gstin: string;
  ok: boolean;
  error: string;
  stateCode: string | null;
  pan: string | null;
} {
  const gstin = normaliseGstin(value);
  const check = validateGstin(gstin);
  return {
    gstin,
    ok: check.ok,
    error: check.error,
    stateCode: check.ok ? stateFromGstin(gstin) : null,
    pan: check.ok ? gstin.slice(2, 12) : null,
  };
}
