import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, business, parties } from "../src/db/schema";
import {
  checkGstin,
  createHsn,
  createParty,
  createTaxRate,
  getBusiness,
  getMeta,
  listHsn,
  listParties,
  listTaxRates,
  updateBusiness,
  updateHsn,
  updateParty,
  updateTaxRate,
} from "../src/server/masters";
import { createTestDatabase, type TestDatabase } from "./helpers/db";

const GSTIN = "33AAPFU0939F1Z2";
const PAN = "AAPFU0939F";
const ACTOR = { id: 1, email: "owner@example.com" };

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

async function auditCount(): Promise<number> {
  return (await database.db.select().from(auditLog)).length;
}

describe("business settings", () => {
  it("creates the single business row with defaults on first read", async () => {
    const row = await getBusiness(database.db);
    expect(row.id).toBe(1);
    expect(row.stateCode).toBe("33");
    expect(row.filingFrequency).toBe("monthly");
    expect(row.b2clLimitPaise).toBe(10_000_000);
    expect(row.invoicePrefix).toBe("DC/");

    const again = await getBusiness(database.db);
    expect(again.id).toBe(1);
    expect(await database.db.select().from(business)).toHaveLength(1);
  });

  it("normalises strings, derives the PAN and audits the change", async () => {
    const saved = await updateBusiness(database.db, ACTOR, {
      legalName: "  Anna Catering  ",
      tradeName: " Anna's ",
      gstin: ` ${GSTIN.toLowerCase()} `,
      stateCode: "33",
      address: "  12 Gandhi Street  ",
      phone: " 9876543210 ",
      filingFrequency: "quarterly",
      b2clLimitPaise: 250_000,
    });

    expect(saved.legalName).toBe("Anna Catering");
    expect(saved.tradeName).toBe("Anna's");
    expect(saved.gstin).toBe(GSTIN);
    expect(saved.pan).toBe(PAN);
    expect(saved.address).toBe("12 Gandhi Street");
    expect(saved.phone).toBe("9876543210");
    expect(saved.filingFrequency).toBe("quarterly");
    expect(saved.b2clLimitPaise).toBe(250_000);

    const events = await database.db.select().from(auditLog);
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("update");
    expect(events[0]?.entityType).toBe("business");
    expect(events[0]?.userEmail).toBe(ACTOR.email);
  });

  it("rejects a bad GSTIN, a state mismatch, a PAN mismatch and a bad state", async () => {
    await expect(
      updateBusiness(database.db, ACTOR, { gstin: "33AAPFU0939F1Z3", stateCode: "33" }),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      updateBusiness(database.db, ACTOR, { gstin: GSTIN, stateCode: "29" }),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      updateBusiness(database.db, ACTOR, { gstin: GSTIN, pan: "AAAAA1111A", stateCode: "33" }),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      updateBusiness(database.db, ACTOR, { stateCode: "ZZ" }),
    ).rejects.toMatchObject({ status: 422 });

    expect(await auditCount()).toBe(0);

    await expect(
      updateBusiness(database.db, ACTOR, { pan: "not a pan" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("keeps a valid PAN and rejects an invalid one", async () => {
    const saved = await updateBusiness(database.db, ACTOR, { pan: PAN.toLowerCase() });
    expect(saved.pan).toBe(PAN);

    await expect(
      updateBusiness(database.db, ACTOR, { pan: "ABCDE1234" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects an out-of-range financial year and a negative B2CL limit", async () => {
    await expect(
      updateBusiness(database.db, ACTOR, { fyStartYear: 1999 }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      updateBusiness(database.db, ACTOR, { b2clLimitPaise: -1 }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("meta", () => {
  it("returns states, units, rates and the current and previous periods", async () => {
    await createTaxRate(database.db, ACTOR, { rateBp: 500, label: "Catering" });
    const meta = await getMeta(database.db, "2026-11-05");

    expect(meta.states.find((state) => state.code === "33")?.name).toBe("Tamil Nadu");
    expect(meta.uqc).toContain("NA");
    expect(meta.supplyKinds).toContain("zero_rated");
    expect(meta.rates.map((rate) => rate.rateBp)).toEqual([500]);
    expect(meta.currentFy).toBe("2026-27");
    expect(meta.currentPeriod).toBe("2026-11");
    expect(meta.periods).toHaveLength(12);
    expect(meta.periods[0]?.key).toBe("2026-04");
    expect(meta.previousPeriods[0]?.key).toBe("2025-04");
  });
});

describe("GSTIN check", () => {
  it("reports the state and PAN of a valid number", () => {
    expect(checkGstin(` ${GSTIN.toLowerCase()} `)).toEqual({
      gstin: GSTIN,
      ok: true,
      error: "",
      stateCode: "33",
      pan: PAN,
    });
  });

  it("reports a checksum failure", () => {
    const result = checkGstin("33AAPFU0939F1Z3");
    expect(result.ok).toBe(false);
    expect(result.error.toLowerCase()).toContain("checksum");
    expect(result.stateCode).toBeNull();
  });
});

describe("tax rates", () => {
  it("adds a rate, refuses a duplicate and audits both changes", async () => {
    const created = await createTaxRate(database.db, ACTOR, {
      rateBp: 500,
      label: "  Catering  ",
    });
    expect(created.rateBp).toBe(500);
    expect(created.label).toBe("Catering");

    await expect(
      createTaxRate(database.db, ACTOR, { rateBp: 500 }),
    ).rejects.toMatchObject({ status: 409 });

    const updated = await updateTaxRate(database.db, ACTOR, created.id, {
      label: "Catering without ITC",
      active: false,
    });
    expect(updated.label).toBe("Catering without ITC");
    expect(updated.active).toBe(false);

    expect(await auditCount()).toBe(2);
    expect((await listTaxRates(database.db)).map((rate) => rate.rateBp)).toEqual([500]);
  });

  it("rejects a rate outside 0 to 100 percent and an unknown id", async () => {
    await expect(
      createTaxRate(database.db, ACTOR, { rateBp: 10_001 }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      updateTaxRate(database.db, ACTOR, 999, { label: "Missing" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("HSN and SAC codes", () => {
  beforeEach(async () => {
    await createTaxRate(database.db, ACTOR, { rateBp: 500 });
    await createTaxRate(database.db, ACTOR, { rateBp: 1800 });
  });

  it("adds a code, searches by code or description and audits it", async () => {
    const created = await createHsn(database.db, ACTOR, {
      code: " 996334 ",
      description: " Outdoor catering services ",
      defaultRateBp: 500,
      uqc: "NOS",
      isService: true,
    });
    expect(created.code).toBe("996334");
    expect(created.description).toBe("Outdoor catering services");

    expect(await listHsn(database.db, "9963")).toHaveLength(1);
    expect(await listHsn(database.db, "catering")).toHaveLength(1);
    expect(await listHsn(database.db, "transport")).toHaveLength(0);

    const events = await database.db.select().from(auditLog);
    expect(events.some((event) => event.entityType === "hsn")).toBe(true);
  });

  it("rejects a bad code length, an unknown rate and a duplicate code", async () => {
    await expect(
      createHsn(database.db, ACTOR, { code: "99633", description: "Bad", defaultRateBp: 500 }),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      createHsn(database.db, ACTOR, { code: "996334", description: "Bad", defaultRateBp: 1200 }),
    ).rejects.toMatchObject({ status: 422 });

    await createHsn(database.db, ACTOR, {
      code: "996334",
      description: "Catering",
      defaultRateBp: 500,
    });
    await expect(
      createHsn(database.db, ACTOR, {
        code: "996334",
        description: "Again",
        defaultRateBp: 500,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("updates a code and refuses to take another code's number", async () => {
    const first = await createHsn(database.db, ACTOR, {
      code: "996334",
      description: "Catering",
      defaultRateBp: 500,
    });
    const second = await createHsn(database.db, ACTOR, {
      code: "996335",
      description: "Event catering",
      defaultRateBp: 500,
    });

    await expect(
      updateHsn(database.db, ACTOR, second.id, {
        code: "996334",
        description: "Event catering",
        defaultRateBp: 500,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const updated = await updateHsn(database.db, ACTOR, first.id, {
      code: "996334",
      description: "Outdoor catering",
      defaultRateBp: 1800,
      uqc: "OTH",
      active: false,
    });
    expect(updated.description).toBe("Outdoor catering");
    expect(updated.defaultRateBp).toBe(1800);
    expect(updated.uqc).toBe("OTH");
    expect(updated.active).toBe(false);
  });

  it("rejects an unknown unit", async () => {
    await expect(
      createHsn(database.db, ACTOR, {
        code: "996334",
        description: "Catering",
        defaultRateBp: 500,
        uqc: "DOZEN",
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("parties", () => {
  it("adds a party, derives the state and refuses a duplicate", async () => {
    const created = await createParty(database.db, ACTOR, {
      kind: "customer",
      name: "  Acme Events ",
      gstin: GSTIN.toLowerCase(),
      phone: " 9876543210 ",
    });
    expect(created.name).toBe("Acme Events");
    expect(created.gstin).toBe(GSTIN);
    expect(created.stateCode).toBe("33");
    expect(created.phone).toBe("9876543210");

    await expect(
      createParty(database.db, ACTOR, {
        kind: "customer",
        name: "Acme Events",
        gstin: GSTIN,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const sameNameOtherKind = await createParty(database.db, ACTOR, {
      kind: "supplier",
      name: "Acme Events",
      gstin: GSTIN,
    });
    expect(sameNameOtherKind.kind).toBe("supplier");
  });

  it("fills the state from the business when the party has no GSTIN", async () => {
    await updateBusiness(database.db, ACTOR, { stateCode: "29" });
    const party = await createParty(database.db, ACTOR, {
      kind: "supplier",
      name: "Local vendor",
    });
    expect(party.stateCode).toBe("29");
    expect(party.gstin).toBe("");
  });

  it("rejects a bad GSTIN, a state mismatch and an invalid kind", async () => {
    await expect(
      createParty(database.db, ACTOR, {
        kind: "customer",
        name: "Bad",
        gstin: "33AAPFU0939F1Z3",
      }),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      createParty(database.db, ACTOR, {
        kind: "customer",
        name: "Wrong state",
        gstin: GSTIN,
        stateCode: "29",
      }),
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      createParty(database.db, ACTOR, {
        kind: "vendor" as "supplier",
        name: "Bad kind",
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("filters by kind, search text and active state", async () => {
    const customer = await createParty(database.db, ACTOR, {
      kind: "customer",
      name: "Acme Events",
      gstin: GSTIN,
    });
    await createParty(database.db, ACTOR, {
      kind: "supplier",
      name: "Fresh Foods",
      phone: "9999999999",
    });
    await createParty(database.db, ACTOR, {
      kind: "customer",
      name: "Old Customer",
      active: false,
    });

    expect(await listParties(database.db, { kind: "customer" })).toHaveLength(1);
    expect(await listParties(database.db, { q: "fresh" })).toHaveLength(1);
    expect(await listParties(database.db, { q: "9999" })).toHaveLength(1);
    expect(await listParties(database.db)).toHaveLength(2);
    expect(await listParties(database.db, { includeInactive: true })).toHaveLength(3);

    const updated = await updateParty(database.db, ACTOR, customer.id, {
      kind: "customer",
      name: "Acme Events LLP",
      gstin: GSTIN,
      active: false,
    });
    expect(updated.name).toBe("Acme Events LLP");
    expect(updated.active).toBe(false);
  });

  it("refuses to duplicate another party on update", async () => {
    const first = await createParty(database.db, ACTOR, {
      kind: "customer",
      name: "Acme Events",
    });
    const second = await createParty(database.db, ACTOR, {
      kind: "customer",
      name: "Other Events",
    });

    await expect(
      updateParty(database.db, ACTOR, second.id, {
        kind: "customer",
        name: "Acme Events",
      }),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      updateParty(database.db, ACTOR, 999, { kind: "customer", name: "Missing" }),
    ).rejects.toMatchObject({ status: 404 });

    const rows = await database.db
      .select()
      .from(parties)
      .where(eq(parties.id, first.id));
    expect(rows).toHaveLength(1);
  });
});
