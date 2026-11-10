import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, business, returnPeriods } from "../src/db/schema";
import { getBusiness } from "../src/server/masters";
import {
  amendSale,
  cancelSale,
  createSale,
  getSale,
  listSales,
  nextSalesNumber,
  updateSale,
  type SalesFilters,
} from "../src/server/sales-service";
import {
  cancelPurchase,
  createPurchase,
  listPurchases,
  updatePurchase,
} from "../src/server/purchase-service";
import type { PurchaseInput, SalesInput } from "../src/lib/docs";
import { createTestDatabase, type TestDatabase } from "./helpers/db";

const ACTOR = { id: 1, email: "owner@example.com" };

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.reset();
  await getBusiness(database.db);
  // The seeded business is on the 5% no-ITC scheme; these tests exercise input ITC.
  await database.db.update(business).set({ noItcScheme: false });
});

function salesInput(overrides: Partial<SalesInput> = {}): SalesInput {
  return {
    number: "DC/26-27/001",
    date: "2026-10-15",
    partyName: "Walk-in customer",
    lines: [
      {
        description: "Catering",
        hsnSac: "9985",
        qty: 1,
        unitPricePaise: 100_000,
        gstRateBp: 500,
      },
    ],
    ...overrides,
  };
}

function purchaseInput(overrides: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    number: "SUP-1",
    date: "2026-10-15",
    supplierName: "Supplier",
    supplierStateCode: "33",
    category: "inputs",
    lines: [
      {
        qty: 1,
        unitPricePaise: 100_000,
        gstRateBp: 500,
      },
    ],
    ...overrides,
  };
}

async function lock(period: string) {
  await database.db.insert(returnPeriods).values({
    period,
    fy: "2026-27",
    locked: true,
  });
}

describe("sales service", () => {
  it("creates a sale with lines, totals, section and an audit row", async () => {
    const created = await createSale(database.db, ACTOR, salesInput(), "2026-11-09");

    expect(created.totalPaise).toBe(105_000);
    expect(created.cgstPaise).toBe(2_500);
    expect(created.sgstPaise).toBe(2_500);
    expect(created.section).toBe("b2cs");
    expect(created.lines).toHaveLength(1);
    expect(created.lines[0]?.position).toBe(0);

    const detail = await getSale(database.db, created.id);
    expect(detail?.lines[0]?.description).toBe("Catering");

    const audits = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, "sale"));
    expect(audits.some((row) => row.action === "create")).toBe(true);
  });

  it("rejects a duplicate invoice number", async () => {
    await createSale(database.db, ACTOR, salesInput(), "2026-11-09");
    await expect(
      createSale(database.db, ACTOR, salesInput(), "2026-11-09"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("filters and paginates in SQL with accurate totals", async () => {
    await createSale(database.db, ACTOR, salesInput({ number: "DC/26-27/001" }), "2026-11-09");
    await createSale(
      database.db,
      ACTOR,
      salesInput({
        number: "DC/26-27/002",
        date: "2026-10-16",
        partyName: "Registered",
        partyGstin: "33AAPFU0939F1Z2",
        placeOfSupply: "33",
      }),
      "2026-11-09",
    );
    await createSale(
      database.db,
      ACTOR,
      salesInput({ number: "DC/26-27/003", date: "2026-11-01" }),
      "2026-11-09",
    );

    const filters: SalesFilters = {
      from: "2026-10-01",
      to: "2026-10-31",
      q: "DC/26-27",
      page: 1,
      size: 1,
    };
    const page = await listSales(database.db, filters);

    expect(page.total).toBe(2);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]?.number).toBe("DC/26-27/002");
    expect(page.sums.taxableValuePaise).toBe(200_000);
    expect(page.sums.taxPaise).toBe(10_000);
    expect(page.sums.totalPaise).toBe(210_000);

    const b2b = await listSales(database.db, { section: "b2b" });
    expect(b2b.total).toBe(1);
  });

  it("blocks create, update and cancel when the period is locked", async () => {
    const created = await createSale(database.db, ACTOR, salesInput(), "2026-11-09");
    await lock("2026-10");

    await expect(
      createSale(database.db, ACTOR, salesInput({ number: "DC/26-27/002" }), "2026-11-09"),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      updateSale(
        database.db,
        ACTOR,
        created.id,
        salesInput({ notes: "changed" }),
        "2026-11-09",
      ),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      cancelSale(database.db, ACTOR, created.id),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("amends a filed invoice into the current period and links both rows", async () => {
    const original = await createSale(database.db, ACTOR, salesInput(), "2026-11-09");
    await lock("2026-10");

    const amended = await amendSale(
      database.db,
      ACTOR,
      original.id,
      salesInput({ number: "", date: "2026-11-09" }),
      "2026-11-09",
    );

    expect(amended.number).toBe("DC/26-27/001~A");
    expect(amended.amendsId).toBe(original.id);
    expect(amended.amendPeriod).toBe("2026-11");

    const after = await getSale(database.db, original.id);
    expect(after?.status).toBe("amended");
    expect(after?.amendedById).toBe(amended.id);

    const audits = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, "sale"));
    expect(audits.some((row) => row.action === "amend")).toBe(true);

    await expect(
      amendSale(database.db, ACTOR, original.id, salesInput(), "2026-11-09"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("generates the next number in the current series", async () => {
    await createSale(database.db, ACTOR, salesInput({ number: "DC/26-27/001" }), "2026-11-09");
    const next = await nextSalesNumber(database.db, "invoice");
    expect(next).toMatch(/^DC\/26-27\/\d{3}$/);
    expect(next).toBe("DC/26-27/002");
  });
});

describe("purchase service", () => {
  it("creates a purchase with per-line ITC and the default ITC period", async () => {
    const created = await createPurchase(
      database.db,
      ACTOR,
      purchaseInput(),
      "2026-11-09",
    );

    expect(created.totalPaise).toBe(105_000);
    expect(created.itcPeriod).toBe("2026-10");
    expect(created.lines[0]?.itcEligible).toBe(true);
  });

  it("filters by ITC eligibility before pagination", async () => {
    await createPurchase(
      database.db,
      ACTOR,
      purchaseInput({ number: "P-1", date: "2026-10-01" }),
      "2026-11-09",
    );
    await createPurchase(
      database.db,
      ACTOR,
      purchaseInput({ number: "P-2", date: "2026-10-02" }),
      "2026-11-09",
    );
    await createPurchase(
      database.db,
      ACTOR,
      purchaseInput({ number: "P-3", date: "2026-10-03", category: "expense" }),
      "2026-11-09",
    );

    const eligible = await listPurchases(database.db, {
      itc: "eligible",
      page: 1,
      size: 1,
    });
    expect(eligible.total).toBe(2);
    expect(eligible.rows).toHaveLength(1);
    expect(eligible.rows[0]?.number).toBe("P-2");

    const ineligible = await listPurchases(database.db, { itc: "ineligible" });
    expect(ineligible.total).toBe(1);
    expect(ineligible.rows[0]?.number).toBe("P-3");
  });

  it("blocks an ITC eligibility change when only the ITC period is locked", async () => {
    const created = await createPurchase(
      database.db,
      ACTOR,
      purchaseInput({ date: "2026-09-20", itcPeriod: "2026-10" }),
      "2026-11-09",
    );
    await lock("2026-10");

    await expect(
      updatePurchase(
        database.db,
        ACTOR,
        created.id,
        purchaseInput({
          date: "2026-09-20",
          itcPeriod: "2026-10",
          lines: [
            {
              qty: 1,
              unitPricePaise: 100_000,
              gstRateBp: 500,
              itcEligible: false,
              itcReason: "Personal use",
            },
          ],
        }),
        "2026-11-09",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("blocks moving the ITC period into a locked month", async () => {
    const created = await createPurchase(
      database.db,
      ACTOR,
      purchaseInput({ date: "2026-09-20", itcPeriod: "2026-09" }),
      "2026-11-09",
    );
    await lock("2026-11");

    await expect(
      updatePurchase(
        database.db,
        ACTOR,
        created.id,
        purchaseInput({ date: "2026-09-20", itcPeriod: "2026-11" }),
        "2026-11-09",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a duplicate supplier bill", async () => {
    await createPurchase(database.db, ACTOR, purchaseInput(), "2026-11-09");
    await expect(
      createPurchase(database.db, ACTOR, purchaseInput(), "2026-11-09"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("blocks cancelling a bill in a locked period", async () => {
    const created = await createPurchase(
      database.db,
      ACTOR,
      purchaseInput(),
      "2026-11-09",
    );
    await lock("2026-10");
    await expect(
      cancelPurchase(database.db, ACTOR, created.id),
    ).rejects.toMatchObject({ status: 409 });
  });
});
