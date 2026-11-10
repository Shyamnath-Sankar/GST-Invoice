/**
 * Purchase bills. The bill date and the ITC period are independently locked:
 * moving or re-deciding ITC for a filed month is rejected.
 */
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db } from "@/db/client";
import { purchaseLines, purchases } from "@/db/schema";
import {
  buildPurchaseDoc,
  isFutureDate,
  isoToday,
  type BuiltLine,
  type BuiltPurchaseDoc,
  type PurchaseCategory,
  type PurchaseInput,
} from "@/lib/docs";
import { parseDate } from "@/lib/gst/periods";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { getBusiness } from "./business-service";
import {
  assertDatesUnlocked,
  assertPeriodsUnlocked,
  attachmentCounts,
  businessContext,
  isUniqueViolation,
} from "./doc-common";
import { ApiError } from "./errors";
import { findOrCreateParty } from "./party-service";

export type PurchaseRow = typeof purchases.$inferSelect;
export type PurchaseLineRow = typeof purchaseLines.$inferSelect;

export interface PurchaseWithLines extends PurchaseRow {
  lines: PurchaseLineRow[];
}

export interface CreatePurchaseInput extends PurchaseInput {
  supplierId?: number | null;
  saveParty?: boolean;
}

export interface PurchaseFilters {
  from?: string;
  to?: string;
  q?: string;
  category?: string;
  itc?: string;
  recon?: string;
  status?: string;
  page?: number;
  size?: number;
}

export interface PurchaseSums {
  taxableValuePaise: number;
  taxPaise: number;
  totalPaise: number;
}

export interface ListPurchasesResult {
  rows: Array<PurchaseRow & { attachments: number; itcEligiblePaise: number }>;
  total: number;
  page: number;
  size: number;
  sums: PurchaseSums;
}

const ALL_DATES = { from: "2000-01-01", to: "2100-01-01" };

function dateRange(filters: PurchaseFilters): { from: string; to: string } {
  const from = filters.from || ALL_DATES.from;
  const to = filters.to || ALL_DATES.to;
  try {
    parseDate(from);
    parseDate(to);
  } catch {
    throw new ApiError(422, "Dates must look like 2026-10-31");
  }
  if (from > to) {
    throw new ApiError(422, "The start date is after the end date");
  }
  return { from, to };
}

function pageValues(filters: PurchaseFilters): { page: number; size: number } {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const size = Math.min(200, Math.max(1, Math.trunc(filters.size ?? 50)));
  return { page, size };
}

function docValues(
  built: BuiltPurchaseDoc,
): Omit<typeof purchases.$inferInsert, "supplierId"> {
  const { lines, ...rest } = built;
  void lines;
  return rest;
}

function lineValues(docId: number, line: BuiltLine): typeof purchaseLines.$inferInsert {
  return {
    docId,
    position: line.position,
    description: line.description,
    hsnSac: line.hsnSac,
    qty: String(line.qty),
    unit: line.unit,
    unitPricePaise: line.unitPricePaise,
    discountPaise: line.discountPaise,
    gstRateBp: line.gstRateBp,
    cessRateBp: line.cessRateBp,
    supplyKind: line.supplyKind,
    taxableValuePaise: line.taxableValuePaise,
    cgstPaise: line.cgstPaise,
    sgstPaise: line.sgstPaise,
    igstPaise: line.igstPaise,
    cessPaise: line.cessPaise,
    totalPaise: line.totalPaise,
    itcEligible: line.itcEligible ?? false,
    itcReason: line.itcReason ?? "",
  };
}

function uniqueMessage(input: BuiltPurchaseDoc): ApiError {
  return new ApiError(
    409,
    `Bill ${input.number} from this supplier is already recorded`,
  );
}

async function assertBillFree(
  db: Db,
  input: BuiltPurchaseDoc,
  excludeId?: number,
): Promise<void> {
  const clauses: SQL[] = [
    eq(purchases.supplierGstin, input.supplierGstin),
    eq(purchases.supplierName, input.supplierName),
    eq(purchases.number, input.number),
    eq(purchases.docType, input.docType),
  ];
  if (excludeId !== undefined) {
    clauses.push(ne(purchases.id, excludeId));
  }
  const [existing] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(...clauses))
    .limit(1);
  if (existing) {
    throw uniqueMessage(input);
  }
}

export async function listPurchases(
  db: Db,
  filters: PurchaseFilters = {},
): Promise<ListPurchasesResult> {
  const { from, to } = dateRange(filters);
  const { page, size } = pageValues(filters);
  const clauses: SQL[] = [gte(purchases.date, from), lte(purchases.date, to)];

  const q = (filters.q ?? "").trim();
  if (q) {
    const search = or(
      ilike(purchases.number, `%${q}%`),
      ilike(purchases.supplierName, `%${q}%`),
      ilike(purchases.supplierGstin, `%${q}%`),
    );
    if (search) {
      clauses.push(search);
    }
  }
  if (filters.category) {
    clauses.push(eq(purchases.category, filters.category as PurchaseCategory));
  }
  if (filters.recon) {
    clauses.push(eq(purchases.reconStatus, filters.recon as PurchaseRow["reconStatus"]));
  }
  if (filters.status) {
    clauses.push(eq(purchases.status, filters.status as PurchaseRow["status"]));
  }
  if (filters.itc === "eligible") {
    clauses.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(purchaseLines)
          .where(
            and(
              eq(purchaseLines.docId, purchases.id),
              eq(purchaseLines.itcEligible, true),
            ),
          ),
      ),
    );
  } else if (filters.itc === "ineligible") {
    clauses.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(purchaseLines)
          .where(
            and(
              eq(purchaseLines.docId, purchases.id),
              eq(purchaseLines.itcEligible, false),
            ),
          ),
      ),
    );
  }

  const where = and(...clauses);
  const [totals] = await db.select({ value: count() }).from(purchases).where(where);
  const rows = await db
    .select()
    .from(purchases)
    .where(where)
    .orderBy(desc(purchases.date), desc(purchases.id))
    .limit(size)
    .offset((page - 1) * size);

  const [sums] = await db
    .select({
      taxable: sql<string>`coalesce(sum(${purchases.taxableValuePaise}), 0)`,
      tax: sql<string>`coalesce(sum(${purchases.cgstPaise} + ${purchases.sgstPaise} + ${purchases.igstPaise} + ${purchases.cessPaise}), 0)`,
      total: sql<string>`coalesce(sum(${purchases.totalPaise}), 0)`,
    })
    .from(purchases)
    .where(
      and(
        where,
        eq(purchases.status, "active"),
        eq(purchases.docType, "invoice"),
      ),
    );

  const ids = rows.map((row) => row.id);
  const attachments = await attachmentCounts(db, "purchase", ids);
  const itcRows =
    ids.length === 0
      ? []
      : await db
          .select({
            docId: purchaseLines.docId,
            value: sql<string>`coalesce(sum(case when ${purchaseLines.itcEligible} then ${purchaseLines.cgstPaise} + ${purchaseLines.sgstPaise} + ${purchaseLines.igstPaise} + ${purchaseLines.cessPaise} else 0 end), 0)`,
          })
          .from(purchaseLines)
          .where(inArray(purchaseLines.docId, ids))
          .groupBy(purchaseLines.docId);
  const itc = new Map(itcRows.map((row) => [Number(row.docId), Number(row.value)]));

  return {
    rows: rows.map((row) => ({
      ...row,
      attachments: attachments.get(row.id) ?? 0,
      itcEligiblePaise: itc.get(row.id) ?? 0,
    })),
    total: Number(totals?.value ?? 0),
    page,
    size,
    sums: {
      taxableValuePaise: Number(sums?.taxable ?? 0),
      taxPaise: Number(sums?.tax ?? 0),
      totalPaise: Number(sums?.total ?? 0),
    },
  };
}

export async function getPurchase(
  db: Db,
  id: number,
): Promise<PurchaseWithLines | null> {
  const [row] = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
  if (!row) {
    return null;
  }
  const lines = await db
    .select()
    .from(purchaseLines)
    .where(eq(purchaseLines.docId, id))
    .orderBy(purchaseLines.position);
  return { ...row, lines };
}

export async function createPurchase(
  db: Db,
  actor: Actor,
  input: CreatePurchaseInput,
  today: string = isoToday(),
): Promise<PurchaseWithLines> {
  if (isFutureDate(input.date, today)) {
    throw new ApiError(422, "The date is in the future");
  }
  const settings = await getBusiness(db);
  const built = buildPurchaseDoc(input, businessContext(settings));
  await assertDatesUnlocked(db, [built.date]);
  await assertPeriodsUnlocked(db, [built.itcPeriod]);

  let supplierId = input.supplierId ?? null;
  if (!supplierId && (input.saveParty ?? true)) {
    const party = await findOrCreateParty(db, actor, {
      kind: "supplier",
      name: built.supplierName,
      gstin: built.supplierGstin,
      stateCode: built.supplierStateCode,
    });
    supplierId = party.id;
  }

  await assertBillFree(db, built);

  try {
    return await db.transaction(async (tx) => {
      const store = tx as unknown as Db;
      const [row] = await store
        .insert(purchases)
        .values({ ...docValues(built), supplierId, createdBy: actor.id })
        .returning();
      if (!row) {
        throw new ApiError(500, "Could not save the bill");
      }
      const lines = await store
        .insert(purchaseLines)
        .values(built.lines.map((line) => lineValues(row.id, line)))
        .returning();
      await audit(store, {
        userId: actor.id,
        userEmail: actor.email,
        action: "create",
        entityType: "purchase",
        entityId: row.id,
        summary: `Recorded bill ${row.number} from ${row.supplierName}`,
        after: { ...row, lines },
      });
      return { ...row, lines };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw uniqueMessage(built);
    }
    throw error;
  }
}

export async function updatePurchase(
  db: Db,
  actor: Actor,
  id: number,
  input: CreatePurchaseInput,
  today: string = isoToday(),
): Promise<PurchaseWithLines> {
  const current = await getPurchase(db, id);
  if (!current) {
    throw new ApiError(404, "Bill not found");
  }
  if (current.status !== "active") {
    throw new ApiError(409, "Cancelled bills cannot be edited");
  }
  if (isFutureDate(input.date, today)) {
    throw new ApiError(422, "The date is in the future");
  }
  const settings = await getBusiness(db);
  const built = buildPurchaseDoc(input, businessContext(settings));

  // Defect 4: the old and new ITC periods are both locked checks, not just the bill date.
  await assertDatesUnlocked(db, [current.date, built.date]);
  await assertPeriodsUnlocked(db, [current.itcPeriod, built.itcPeriod]);
  await assertBillFree(db, built, id);

  try {
    return await db.transaction(async (tx) => {
      const store = tx as unknown as Db;
      const [row] = await store
        .update(purchases)
        .set({
          ...docValues(built),
          supplierId: input.supplierId ?? current.supplierId,
          reconStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(purchases.id, id))
        .returning();
      if (!row) {
        throw new ApiError(500, "Could not save the bill");
      }
      await store.delete(purchaseLines).where(eq(purchaseLines.docId, id));
      const lines = await store
        .insert(purchaseLines)
        .values(built.lines.map((line) => lineValues(id, line)))
        .returning();
      await audit(store, {
        userId: actor.id,
        userEmail: actor.email,
        action: "update",
        entityType: "purchase",
        entityId: id,
        summary: `Edited bill ${row.number}`,
        before: current,
        after: { ...row, lines },
      });
      return { ...row, lines };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw uniqueMessage(built);
    }
    throw error;
  }
}

export async function cancelPurchase(
  db: Db,
  actor: Actor,
  id: number,
): Promise<PurchaseWithLines> {
  const current = await getPurchase(db, id);
  if (!current) {
    throw new ApiError(404, "Bill not found");
  }
  if (current.status === "cancelled") {
    return current;
  }
  await assertDatesUnlocked(db, [current.date]);
  await assertPeriodsUnlocked(db, [current.itcPeriod]);

  const [row] = await db
    .update(purchases)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(purchases.id, id))
    .returning();
  if (!row) {
    throw new ApiError(500, "Could not cancel the bill");
  }
  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "cancel",
    entityType: "purchase",
    entityId: id,
    summary: `Cancelled bill ${row.number} from ${row.supplierName}`,
    before: current,
    after: { ...row, lines: current.lines },
  });
  return { ...row, lines: current.lines };
}
