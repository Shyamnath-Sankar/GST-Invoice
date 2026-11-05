/** Customers and suppliers, unique by kind, name and GSTIN. */
import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { parties, type PartyKind } from "@/db/schema";
import { normaliseGstin, stateFromGstin, STATES, validateGstin } from "@/lib/gst/gstin";
import type { Actor } from "./actor";
import { getBusiness } from "./business-service";
import { ApiError } from "./errors";
import { audit } from "./audit";

export type PartyRow = typeof parties.$inferSelect;

export interface PartyInput {
  kind: PartyKind;
  name: string;
  gstin?: string;
  address?: string;
  stateCode?: string;
  phone?: string;
  email?: string;
  active?: boolean;
}

export interface PartyFilters {
  kind?: PartyKind;
  q?: string;
  includeInactive?: boolean;
}

function text(value: string): string {
  return value.trim();
}

export async function listParties(db: Db, filters: PartyFilters = {}): Promise<PartyRow[]> {
  const clauses: SQL[] = [];
  if (filters.kind) {
    if (filters.kind !== "customer" && filters.kind !== "supplier") {
      throw new ApiError(422, "Kind must be customer or supplier");
    }
    clauses.push(eq(parties.kind, filters.kind));
  }
  if (!filters.includeInactive) {
    clauses.push(eq(parties.active, true));
  }
  const q = (filters.q ?? "").trim();
  if (q) {
    const search = or(
      ilike(parties.name, `%${q}%`),
      ilike(parties.gstin, `%${q}%`),
      ilike(parties.phone, `%${q}%`),
    );
    if (search) {
      clauses.push(search);
    }
  }
  const where = clauses.length > 0 ? and(...clauses) : undefined;
  return db.select().from(parties).where(where).orderBy(parties.name).limit(500);
}

async function partyData(
  db: Db,
  input: PartyInput,
  currentId?: number,
): Promise<{
  kind: PartyKind;
  name: string;
  gstin: string;
  address: string;
  stateCode: string;
  phone: string;
  email: string;
  active: boolean;
}> {
  if (input.kind !== "customer" && input.kind !== "supplier") {
    throw new ApiError(422, "Kind must be customer or supplier");
  }
  const name = text(input.name);
  if (!name) {
    throw new ApiError(422, "Name is required");
  }

  const gstin = normaliseGstin(input.gstin);
  if (gstin) {
    const check = validateGstin(gstin);
    if (!check.ok) {
      throw new ApiError(422, `GSTIN: ${check.error}`);
    }
  }

  const settings = await getBusiness(db);
  const stateCode = text(input.stateCode ?? "") || stateFromGstin(gstin) || settings.stateCode;
  if (!(stateCode in STATES)) {
    throw new ApiError(422, "Choose a valid state");
  }
  if (gstin && gstin.slice(0, 2) !== stateCode) {
    throw new ApiError(422, "The state does not match the GSTIN");
  }

  const [existing] = await db
    .select({ id: parties.id })
    .from(parties)
    .where(and(eq(parties.kind, input.kind), eq(parties.name, name), eq(parties.gstin, gstin)))
    .limit(1);
  if (existing && existing.id !== currentId) {
    throw new ApiError(409, `This ${input.kind} is already in your list`);
  }

  return {
    kind: input.kind,
    name,
    gstin,
    address: text(input.address ?? ""),
    stateCode,
    phone: text(input.phone ?? ""),
    email: text(input.email ?? ""),
    active: input.active ?? true,
  };
}

export async function createParty(db: Db, actor: Actor, input: PartyInput): Promise<PartyRow> {
  const data = await partyData(db, input);
  const [created] = await db.insert(parties).values(data).returning();
  if (!created) {
    throw new ApiError(500, "Could not add the party");
  }

  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "create",
    entityType: "party",
    entityId: created.id,
    summary: `Added ${created.kind} ${created.name}`,
    after: created,
  });
  return created;
}

export async function updateParty(
  db: Db,
  actor: Actor,
  id: number,
  input: PartyInput,
): Promise<PartyRow> {
  const [current] = await db.select().from(parties).where(eq(parties.id, id)).limit(1);
  if (!current) {
    throw new ApiError(404, "Not found");
  }
  const data = await partyData(db, input, id);
  const [updated] = await db
    .update(parties)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(parties.id, id))
    .returning();
  if (!updated) {
    throw new ApiError(500, "Could not save the party");
  }

  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "update",
    entityType: "party",
    entityId: updated.id,
    summary: `Updated ${updated.kind} ${updated.name}`,
    before: current,
    after: updated,
  });
  return updated;
}
