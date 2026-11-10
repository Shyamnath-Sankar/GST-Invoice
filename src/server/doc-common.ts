/** Helpers shared by the sales and purchase services. */
import { and, count, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { documents, returnPeriods, type business } from "@/db/schema";
import type { DocBusiness } from "@/lib/docs";
import { monthKey, parseDate, quarterKey } from "@/lib/gst/periods";
import { ApiError } from "./errors";

export type BusinessRow = typeof business.$inferSelect;

export function businessContext(row: BusinessRow): DocBusiness {
  return {
    stateCode: row.stateCode,
    defaultPriceMode: row.defaultPriceMode,
    roundOff: row.roundOff,
    b2clLimitPaise: row.b2clLimitPaise,
    noItcScheme: row.noItcScheme,
  };
}

/** Reject writes touching a filed-and-locked month or quarter. */
export async function assertDatesUnlocked(
  db: Db,
  dates: readonly (string | null | undefined)[],
): Promise<void> {
  const keys = new Set<string>();
  for (const date of dates) {
    if (!date) {
      continue;
    }
    try {
      parseDate(date);
    } catch {
      throw new ApiError(422, `Unknown date ${date}`);
    }
    keys.add(monthKey(date));
    keys.add(quarterKey(date));
  }
  await assertPeriodsUnlocked(db, [...keys]);
}

/** Reject writes touching a filed-and-locked ITC period key. */
export async function assertPeriodsUnlocked(
  db: Db,
  periods: readonly (string | null | undefined)[],
): Promise<void> {
  const keys = [...new Set(periods.filter((period): period is string => Boolean(period)))];
  if (keys.length === 0) {
    return;
  }
  const [locked] = await db
    .select({ period: returnPeriods.period })
    .from(returnPeriods)
    .where(and(eq(returnPeriods.locked, true), inArray(returnPeriods.period, keys)))
    .limit(1);
  if (locked) {
    throw new ApiError(
      409,
      `${locked.period} is filed and locked. The owner can unlock it from Returns if a change is really needed`,
    );
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** Attachment count per document, for the list screens. */
export async function attachmentCounts(
  db: Db,
  entityType: "sale" | "purchase",
  ids: readonly number[],
): Promise<Map<number, number>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ entityId: documents.entityId, value: count() })
    .from(documents)
    .where(and(eq(documents.entityType, entityType), inArray(documents.entityId, [...ids])))
    .groupBy(documents.entityId);
  return new Map(rows.map((row) => [Number(row.entityId), Number(row.value)]));
}
