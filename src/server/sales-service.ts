/**
 * Sales documents: invoices, credit notes, debit notes and amendments.
 * GST is always computed by `src/lib/docs.ts`; this module persists and audits.
 */
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db } from "@/db/client";
import { salesDocs, salesLines } from "@/db/schema";
import {
  buildSalesDoc,
  isFutureDate,
  isoToday,
  nextDocumentNumber,
  type BuiltLine,
  type BuiltSalesDoc,
  type DocType,
  type SalesInput,
} from "@/lib/docs";
import { fyOf, monthKey, parseDate } from "@/lib/gst/periods";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { getBusiness } from "./business-service";
import {
  assertDatesUnlocked,
  attachmentCounts,
  businessContext,
  isUniqueViolation,
} from "./doc-common";
import { ApiError } from "./errors";
import { findOrCreateParty } from "./party-service";

export type SalesRow = typeof salesDocs.$inferSelect;
export type SalesLineRow = typeof salesLines.$inferSelect;

export interface SalesWithLines extends SalesRow {
  lines: SalesLineRow[];
}

export interface CreateSaleInput extends SalesInput {
  partyId?: number | null;
  saveParty?: boolean;
}

export interface SalesFilters {
  from?: string;
  to?: string;
  q?: string;
  section?: string;
  docType?: string;
  status?: string;
  page?: number;
  size?: number;
}

export interface SalesSums {
  taxableValuePaise: number;
  taxPaise: number;
  totalPaise: number;
}

export interface ListSalesResult {
  rows: Array<SalesRow & { attachments: number }>;
  total: number;
  page: number;
  size: number;
  sums: SalesSums;
}

const ALL_DATES = { from: "2000-01-01", to: "2100-01-01" };

function pageValues(filters: SalesFilters): { page: number; size: number } {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const size = Math.min(200, Math.max(1, Math.trunc(filters.size ?? 50)));
  return { page, size };
}

function dateRange(filters: SalesFilters): { from: string; to: string } {
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

function docValues(built: BuiltSalesDoc): Omit<typeof salesDocs.$inferInsert, "partyId"> {
  const { lines, ...rest } = built;
  void lines;
  return rest;
}

function lineValues(docId: number, line: BuiltLine): typeof salesLines.$inferInsert {
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
  };
}

function uniqueMessage(number: string): ApiError {
  return new ApiError(409, `Number ${number} is already used`);
}

async function assertNumberFree(
  db: Db,
  docType: DocType,
  number: string,
  excludeId?: number,
): Promise<void> {
  const clauses: SQL[] = [eq(salesDocs.docType, docType), eq(salesDocs.number, number)];
  if (excludeId !== undefined) {
    clauses.push(ne(salesDocs.id, excludeId));
  }
  const [existing] = await db
    .select({ id: salesDocs.id })
    .from(salesDocs)
    .where(and(...clauses))
    .limit(1);
  if (existing) {
    throw uniqueMessage(number);
  }
}

export async function listSales(db: Db, filters: SalesFilters = {}): Promise<ListSalesResult> {
  const { from, to } = dateRange(filters);
  const { page, size } = pageValues(filters);
  const clauses: SQL[] = [gte(salesDocs.date, from), lte(salesDocs.date, to)];

  const q = (filters.q ?? "").trim();
  if (q) {
    const search = or(
      ilike(salesDocs.number, `%${q}%`),
      ilike(salesDocs.partyName, `%${q}%`),
      ilike(salesDocs.partyGstin, `%${q}%`),
      ilike(salesDocs.orderRef, `%${q}%`),
    );
    if (search) {
      clauses.push(search);
    }
  }
  if (filters.section === "b2b") {
    clauses.push(ne(salesDocs.partyGstin, ""));
  } else if (filters.section === "b2c") {
    clauses.push(eq(salesDocs.partyGstin, ""));
  } else if (filters.section) {
    clauses.push(eq(salesDocs.section, filters.section));
  }
  if (filters.docType) {
    clauses.push(eq(salesDocs.docType, filters.docType as DocType));
  }
  if (filters.status) {
    clauses.push(eq(salesDocs.status, filters.status as SalesRow["status"]));
  }

  const where = and(...clauses);
  const [totals] = await db.select({ value: count() }).from(salesDocs).where(where);
  const rows = await db
    .select()
    .from(salesDocs)
    .where(where)
    .orderBy(desc(salesDocs.date), desc(salesDocs.id))
    .limit(size)
    .offset((page - 1) * size);

  const [sums] = await db
    .select({
      taxable: sql<string>`coalesce(sum(${salesDocs.taxableValuePaise}), 0)`,
      tax: sql<string>`coalesce(sum(${salesDocs.cgstPaise} + ${salesDocs.sgstPaise} + ${salesDocs.igstPaise} + ${salesDocs.cessPaise}), 0)`,
      total: sql<string>`coalesce(sum(${salesDocs.totalPaise}), 0)`,
    })
    .from(salesDocs)
    .where(
      and(
        where,
        eq(salesDocs.status, "active"),
        eq(salesDocs.docType, "invoice"),
      ),
    );

  const attachments = await attachmentCounts(db, "sale", rows.map((row) => row.id));
  return {
    rows: rows.map((row) => ({ ...row, attachments: attachments.get(row.id) ?? 0 })),
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

export async function getSale(db: Db, id: number): Promise<SalesWithLines | null> {
  const [row] = await db.select().from(salesDocs).where(eq(salesDocs.id, id)).limit(1);
  if (!row) {
    return null;
  }
  const lines = await db
    .select()
    .from(salesLines)
    .where(eq(salesLines.docId, id))
    .orderBy(salesLines.position);
  return { ...row, lines };
}

export async function createSale(
  db: Db,
  actor: Actor,
  input: CreateSaleInput,
  today: string = isoToday(),
): Promise<SalesWithLines> {
  if (isFutureDate(input.date, today)) {
    throw new ApiError(422, "The date is in the future");
  }
  await assertDatesUnlocked(db, [input.date]);
  const settings = await getBusiness(db);
  const built = buildSalesDoc(input, businessContext(settings));

  let partyId = input.partyId ?? null;
  if (!partyId && (input.saveParty ?? true)) {
    const party = await findOrCreateParty(db, actor, {
      kind: "customer",
      name: built.partyName,
      gstin: built.partyGstin,
      address: built.partyAddress,
      stateCode: built.partyStateCode,
    });
    partyId = party.id;
  }

  await assertNumberFree(db, built.docType, built.number);

  try {
    return await db.transaction(async (tx) => {
      const store = tx as unknown as Db;
      const [row] = await store
        .insert(salesDocs)
        .values({ ...docValues(built), partyId, createdBy: actor.id })
        .returning();
      if (!row) {
        throw new ApiError(500, "Could not save the invoice");
      }
      const lines = await store
        .insert(salesLines)
        .values(built.lines.map((line) => lineValues(row.id, line)))
        .returning();
      await audit(store, {
        userId: actor.id,
        userEmail: actor.email,
        action: "create",
        entityType: "sale",
        entityId: row.id,
        summary: `Created ${row.docType.replace("_", " ")} ${row.number}`,
        after: { ...row, lines },
      });
      return { ...row, lines };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw uniqueMessage(built.number);
    }
    throw error;
  }
}

export async function updateSale(
  db: Db,
  actor: Actor,
  id: number,
  input: CreateSaleInput,
  today: string = isoToday(),
): Promise<SalesWithLines> {
  const current = await getSale(db, id);
  if (!current) {
    throw new ApiError(404, "Invoice not found");
  }
  if (current.status !== "active") {
    throw new ApiError(409, "Cancelled or amended invoices cannot be edited");
  }
  if (isFutureDate(input.date, today)) {
    throw new ApiError(422, "The date is in the future");
  }
  await assertDatesUnlocked(db, [current.date, input.date]);
  const settings = await getBusiness(db);
  const built = buildSalesDoc(input, businessContext(settings));
  await assertNumberFree(db, built.docType, built.number, id);

  try {
    return await db.transaction(async (tx) => {
      const store = tx as unknown as Db;
      const [row] = await store
        .update(salesDocs)
        .set({
          ...docValues(built),
          partyId: input.partyId ?? current.partyId,
          updatedAt: new Date(),
        })
        .where(eq(salesDocs.id, id))
        .returning();
      if (!row) {
        throw new ApiError(500, "Could not save the invoice");
      }
      await store.delete(salesLines).where(eq(salesLines.docId, id));
      const lines = await store
        .insert(salesLines)
        .values(built.lines.map((line) => lineValues(id, line)))
        .returning();
      await audit(store, {
        userId: actor.id,
        userEmail: actor.email,
        action: "update",
        entityType: "sale",
        entityId: id,
        summary: `Edited ${row.docType.replace("_", " ")} ${row.number}`,
        before: current,
        after: { ...row, lines },
      });
      return { ...row, lines };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw uniqueMessage(built.number);
    }
    throw error;
  }
}

export async function cancelSale(db: Db, actor: Actor, id: number): Promise<SalesWithLines> {
  const current = await getSale(db, id);
  if (!current) {
    throw new ApiError(404, "Invoice not found");
  }
  if (current.status === "cancelled") {
    return current;
  }
  if (current.status === "amended") {
    throw new ApiError(409, "Amended invoices cannot be cancelled");
  }
  await assertDatesUnlocked(db, [current.date]);
  const [row] = await db
    .update(salesDocs)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(salesDocs.id, id))
    .returning();
  if (!row) {
    throw new ApiError(500, "Could not cancel the invoice");
  }
  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "cancel",
    entityType: "sale",
    entityId: id,
    summary: `Cancelled ${row.docType.replace("_", " ")} ${row.number}`,
    before: current,
    after: { ...row, lines: current.lines },
  });
  return { ...row, lines: current.lines };
}

export async function amendSale(
  db: Db,
  actor: Actor,
  id: number,
  input: CreateSaleInput,
  today: string = isoToday(),
): Promise<SalesWithLines> {
  const original = await getSale(db, id);
  if (!original) {
    throw new ApiError(404, "Invoice not found");
  }
  if (original.amendedById) {
    throw new ApiError(409, "This invoice already has an amendment. Amend that one instead");
  }
  if (original.status === "cancelled") {
    throw new ApiError(409, "Cancelled invoices cannot be amended");
  }

  const date = input.date || today;
  if (isFutureDate(date, today)) {
    throw new ApiError(422, "The date is in the future");
  }
  // The original may be in a filed period; the amendment itself is written to an open period.
  await assertDatesUnlocked(db, [date]);

  const amendment: CreateSaleInput = {
    ...input,
    date,
    number: input.number.trim() || original.number,
    originalNumber: input.originalNumber?.trim() || original.number,
    originalDate: input.originalDate || original.date,
    noteReason: input.noteReason || "Amendment",
  };
  const settings = await getBusiness(db);
  const built = buildSalesDoc(amendment, businessContext(settings));
  if (built.number === original.number) {
    built.number = `${original.number}~A`;
  }
  await assertNumberFree(db, built.docType, built.number);

  let partyId = input.partyId ?? original.partyId;
  if (!partyId && (input.saveParty ?? true)) {
    const party = await findOrCreateParty(db, actor, {
      kind: "customer",
      name: built.partyName,
      gstin: built.partyGstin,
      address: built.partyAddress,
      stateCode: built.partyStateCode,
    });
    partyId = party.id;
  }

  try {
    return await db.transaction(async (tx) => {
      const store = tx as unknown as Db;
      const [row] = await store
        .insert(salesDocs)
        .values({
          ...docValues(built),
          partyId,
          createdBy: actor.id,
          amendsId: original.id,
          amendPeriod: monthKey(today),
        })
        .returning();
      if (!row) {
        throw new ApiError(500, "Could not save the amendment");
      }
      const lines = await store
        .insert(salesLines)
        .values(built.lines.map((line) => lineValues(row.id, line)))
        .returning();
      await store
        .update(salesDocs)
        .set({ amendedById: row.id, status: "amended", updatedAt: new Date() })
        .where(eq(salesDocs.id, original.id));
      await audit(store, {
        userId: actor.id,
        userEmail: actor.email,
        action: "amend",
        entityType: "sale",
        entityId: original.id,
        summary: `Amended ${original.number} (reported in ${row.amendPeriod})`,
        before: original,
        after: { ...row, lines },
      });
      return { ...row, lines };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw uniqueMessage(built.number);
    }
    throw error;
  }
}

export async function nextSalesNumber(
  db: Db,
  docType: DocType = "invoice",
  today: string = isoToday(),
): Promise<string> {
  const settings = await getBusiness(db);
  const fy = fyOf(today);
  const rows = await db
    .select({ number: salesDocs.number })
    .from(salesDocs)
    .where(eq(salesDocs.docType, docType));
  return nextDocumentNumber(docType, settings.invoicePrefix, fy, rows.map((row) => row.number));
}
