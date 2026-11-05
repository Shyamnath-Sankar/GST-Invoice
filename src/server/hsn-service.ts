/** HSN / SAC codes. Codes are 4, 6 or 8 digits and point at an existing rate. */
import { eq, ilike, or, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { hsnCodes, taxRates, type SupplyKind } from "@/db/schema";
import { SUPPLY_KINDS } from "@/lib/gst/gst";
import { isValidHsnCode, isValidUqc } from "@/lib/gst/hsn";
import type { Actor } from "./actor";
import { ApiError } from "./errors";
import { audit } from "./audit";

export type HsnRow = typeof hsnCodes.$inferSelect;

export interface HsnInput {
  code: string;
  description: string;
  isService?: boolean;
  defaultRateBp: number;
  supplyKind?: SupplyKind;
  uqc?: string;
  itcAllowed?: boolean;
  notes?: string;
  active?: boolean;
}

function text(value: string): string {
  return value.trim();
}

export async function listHsn(db: Db, query = ""): Promise<HsnRow[]> {
  const q = query.trim();
  const filter: SQL | undefined = q
    ? or(ilike(hsnCodes.code, `${q}%`), ilike(hsnCodes.description, `%${q}%`))
    : undefined;
  return db.select().from(hsnCodes).where(filter).orderBy(hsnCodes.code);
}

async function assertHsn(db: Db, input: HsnInput, currentId?: number): Promise<string> {
  const code = text(input.code);
  if (!isValidHsnCode(code)) {
    throw new ApiError(422, "HSN/SAC must be 4, 6 or 8 digits");
  }
  const supplyKind = input.supplyKind ?? "taxable";
  if (!SUPPLY_KINDS.includes(supplyKind)) {
    throw new ApiError(422, "Unknown supply type");
  }
  const uqc = input.uqc ?? "NA";
  if (!isValidUqc(uqc)) {
    throw new ApiError(422, "Choose a valid unit (UQC)");
  }
  const [rate] = await db
    .select({ id: taxRates.id })
    .from(taxRates)
    .where(eq(taxRates.rateBp, input.defaultRateBp))
    .limit(1);
  if (!rate) {
    throw new ApiError(422, `${input.defaultRateBp / 100}% is not in your rate list`);
  }

  const [existing] = await db
    .select({ id: hsnCodes.id })
    .from(hsnCodes)
    .where(eq(hsnCodes.code, code))
    .limit(1);
  if (existing && existing.id !== currentId) {
    throw new ApiError(409, "This code already exists");
  }
  return code;
}

export async function createHsn(db: Db, actor: Actor, input: HsnInput): Promise<HsnRow> {
  const code = await assertHsn(db, input);
  const description = text(input.description);
  if (!description) {
    throw new ApiError(422, "Description is required");
  }

  const [created] = await db
    .insert(hsnCodes)
    .values({
      code,
      description,
      isService: input.isService ?? true,
      defaultRateBp: input.defaultRateBp,
      supplyKind: input.supplyKind ?? "taxable",
      uqc: input.uqc ?? "NA",
      itcAllowed: input.itcAllowed ?? false,
      notes: text(input.notes ?? ""),
      active: input.active ?? true,
    })
    .returning();
  if (!created) {
    throw new ApiError(500, "Could not add the code");
  }

  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "create",
    entityType: "hsn",
    entityId: created.id,
    summary: `Added HSN/SAC ${code}`,
    after: created,
  });
  return created;
}

export async function updateHsn(
  db: Db,
  actor: Actor,
  id: number,
  input: HsnInput,
): Promise<HsnRow> {
  const [current] = await db.select().from(hsnCodes).where(eq(hsnCodes.id, id)).limit(1);
  if (!current) {
    throw new ApiError(404, "Not found");
  }
  const code = await assertHsn(db, input, id);
  const description = text(input.description);
  if (!description) {
    throw new ApiError(422, "Description is required");
  }

  const [updated] = await db
    .update(hsnCodes)
    .set({
      code,
      description,
      isService: input.isService ?? current.isService,
      defaultRateBp: input.defaultRateBp,
      supplyKind: input.supplyKind ?? current.supplyKind,
      uqc: input.uqc ?? current.uqc,
      itcAllowed: input.itcAllowed ?? current.itcAllowed,
      notes: text(input.notes ?? current.notes),
      active: input.active ?? current.active,
      updatedAt: new Date(),
    })
    .where(eq(hsnCodes.id, id))
    .returning();
  if (!updated) {
    throw new ApiError(500, "Could not save the code");
  }

  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "update",
    entityType: "hsn",
    entityId: updated.id,
    summary: `Updated HSN/SAC ${code}`,
    before: current,
    after: updated,
  });
  return updated;
}
