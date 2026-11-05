/** Tax rates. Stored as integer basis points and unique. */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { taxRates } from "@/db/schema";
import type { Actor } from "./actor";
import { ApiError } from "./errors";
import { audit } from "./audit";

export type TaxRateRow = typeof taxRates.$inferSelect;

export interface TaxRateInput {
  rateBp: number;
  label?: string;
  active?: boolean;
}

function text(value: string): string {
  return value.trim();
}

export async function listTaxRates(db: Db): Promise<TaxRateRow[]> {
  return db.select().from(taxRates).orderBy(taxRates.rateBp);
}

function assertRate(rateBp: number): void {
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10_000) {
    throw new ApiError(422, "Rate must be between 0 and 100 percent");
  }
}

export async function createTaxRate(
  db: Db,
  actor: Actor,
  input: TaxRateInput,
): Promise<TaxRateRow> {
  assertRate(input.rateBp);
  const [existing] = await db
    .select({ id: taxRates.id })
    .from(taxRates)
    .where(eq(taxRates.rateBp, input.rateBp))
    .limit(1);
  if (existing) {
    throw new ApiError(409, "This rate is already in the list");
  }

  const [created] = await db
    .insert(taxRates)
    .values({
      rateBp: input.rateBp,
      label: text(input.label ?? ""),
      active: input.active ?? true,
    })
    .returning();
  if (!created) {
    throw new ApiError(500, "Could not add the rate");
  }

  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "create",
    entityType: "tax_rate",
    entityId: created.id,
    summary: `Added rate ${created.rateBp / 100}%`,
    after: created,
  });
  return created;
}

export async function updateTaxRate(
  db: Db,
  actor: Actor,
  id: number,
  input: Partial<TaxRateInput>,
): Promise<TaxRateRow> {
  const [current] = await db.select().from(taxRates).where(eq(taxRates.id, id)).limit(1);
  if (!current) {
    throw new ApiError(404, "Not found");
  }

  const rateBp = input.rateBp ?? current.rateBp;
  assertRate(rateBp);
  if (rateBp !== current.rateBp) {
    const [existing] = await db
      .select({ id: taxRates.id })
      .from(taxRates)
      .where(eq(taxRates.rateBp, rateBp))
      .limit(1);
    if (existing) {
      throw new ApiError(409, "This rate is already in the list");
    }
  }

  const [updated] = await db
    .update(taxRates)
    .set({
      rateBp,
      label: input.label === undefined ? current.label : text(input.label),
      active: input.active ?? current.active,
    })
    .where(eq(taxRates.id, id))
    .returning();
  if (!updated) {
    throw new ApiError(500, "Could not save the rate");
  }

  await audit(db, {
    userId: actor.id,
    userEmail: actor.email,
    action: "update",
    entityType: "tax_rate",
    entityId: updated.id,
    summary: `Updated rate ${updated.rateBp / 100}%`,
    before: current,
    after: updated,
  });
  return updated;
}
