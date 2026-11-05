/**
 * End-to-end smoke test for Phase 4 against a running server and the real
 * database: setup a temporary owner, read and change the business, check meta,
 * GSTIN validation, rates, HSN and parties, then restore everything.
 *
 *   npx tsx scripts/check-masters.ts
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const base = process.env.SMOKE_URL ?? "http://localhost:3100";
const stamp = Date.now();
const email = `smoke-${stamp}@example.com`;
const password = `smoke pass ${randomBytes(6).toString("hex")}`;
const GSTIN = "33AAPFU0939F1Z2";
let cookie = "";

interface Result {
  status: number;
  body: unknown;
}

async function call(path: string, init: RequestInit = {}): Promise<Result> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") {
    headers.set("x-requested-with", "fetch");
    headers.set("content-type", "application/json");
  }
  if (cookie) {
    headers.set("cookie", cookie);
  }
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) {
    cookie = setCookies.map((value) => value.split(";")[0]).join("; ");
  }
  const text = await response.text();
  return { status: response.status, body: text === "" ? null : JSON.parse(text) };
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

type Row = Record<string, unknown>;

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("No database URL");
}
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });

let partyId: number | null = null;

try {
  const status = await call("/api/auth/status");
  const before = status.body as { needsSetup: boolean };
  check(before.needsSetup, "the database already has a user; clean it first");

  const setup = await call("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke Owner", email, password }),
  });
  check(setup.status === 200, `setup returned ${setup.status}: ${JSON.stringify(setup.body)}`);

  const original = (await call("/api/business")).body as Row;
  check(original.stateCode === "33", "the seeded business row is missing");
  const businessKeys = [
    "legalName",
    "tradeName",
    "gstin",
    "pan",
    "address",
    "stateCode",
    "jurisdiction",
    "registrationType",
    "filingFrequency",
    "fyStartYear",
    "phone",
    "email",
    "proprietor",
    "invoicePrefix",
    "b2clLimitPaise",
    "noItcScheme",
    "roundOff",
    "defaultPriceMode",
  ];
  const restoreBusiness = Object.fromEntries(
    businessKeys.map((key) => [key, original[key]]),
  );

  const saved = await call("/api/business", {
    method: "PUT",
    body: JSON.stringify({
      legalName: "  Smoke Catering  ",
      tradeName: "Smoke Kitchen",
      gstin: GSTIN,
      stateCode: "33",
      address: "1 Test Street",
      phone: "9876543210",
      b2clLimitPaise: 10000000,
    }),
  });
  check(saved.status === 200, `business save returned ${saved.status}: ${JSON.stringify(saved.body)}`);
  const business = saved.body as Row;
  check(business.legalName === "Smoke Catering", "the legal name was not trimmed");
  check(business.gstin === GSTIN, "the GSTIN was not saved");
  check(business.pan === "AAPFU0939F", "the PAN was not derived from the GSTIN");

  const meta = (await call("/api/meta")).body as {
    states: unknown[];
    uqc: string[];
    rates: Array<{ id: number; rateBp: number; label: string; active: boolean }>;
    currentFy: string;
    periods: unknown[];
  };
  check(meta.states.length > 30, "states are missing from meta");
  check(meta.uqc.includes("NA"), "the UQC list is missing");
  check(meta.rates.length >= 6, "the seeded tax rates are missing");
  check(meta.periods.length === 12, "a monthly year should have twelve periods");
  check(/^\d{4}-\d{2}$/.test(meta.currentFy), "currentFy is not a financial year key");

  const gstin = (await call("/api/gstin/check", {
    method: "POST",
    body: JSON.stringify({ gstin: GSTIN }),
  })).body as Row;
  check(gstin.ok === true, "the valid GSTIN was rejected");
  check(gstin.stateCode === "33" && gstin.pan === "AAPFU0939F", "the GSTIN check was wrong");

  const duplicateRate = await call("/api/tax-rates", {
    method: "POST",
    body: JSON.stringify({ rateBp: 500 }),
  });
  check(duplicateRate.status === 409, `duplicate rate returned ${duplicateRate.status}`);

  const badRate = await call("/api/tax-rates", {
    method: "POST",
    body: JSON.stringify({ rateBp: 10100 }),
  });
  check(badRate.status === 422, `out-of-range rate returned ${badRate.status}`);

  const rate = meta.rates.find((row) => row.rateBp === 500);
  check(rate, "the 5% rate is missing");
  const toggled = await call(`/api/tax-rates/${rate.id}`, {
    method: "PUT",
    body: JSON.stringify({ label: "Smoke label", active: !rate.active }),
  });
  check(toggled.status === 200, `rate update returned ${toggled.status}`);
  const restoredRate = await call(`/api/tax-rates/${rate.id}`, {
    method: "PUT",
    body: JSON.stringify({ label: rate.label, active: rate.active }),
  });
  check(restoredRate.status === 200, "the rate was not restored");

  const hsn = (await call("/api/hsn")).body as Row[];
  check(hsn.length >= 10, "the seeded HSN codes are missing");
  const catering = hsn.find((row) => row.code === "996334");
  check(catering, "SAC 996334 is missing");
  const searched = (await call("/api/hsn?q=catering")).body as Row[];
  check(searched.length >= 1, "the HSN search found nothing");

  const duplicateHsn = await call("/api/hsn", {
    method: "POST",
    body: JSON.stringify({ code: "996334", description: "Again", defaultRateBp: 500 }),
  });
  check(duplicateHsn.status === 409, `duplicate HSN returned ${duplicateHsn.status}`);

  const badHsn = await call("/api/hsn", {
    method: "POST",
    body: JSON.stringify({ code: "123", description: "Bad", defaultRateBp: 500 }),
  });
  check(badHsn.status === 422, `bad HSN returned ${badHsn.status}`);

  const originalNotes = catering.notes;
  const changedHsn = await call(`/api/hsn/${catering.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...catering, notes: "smoke" }),
  });
  check(changedHsn.status === 200, `HSN update returned ${changedHsn.status}`);
  const restoredHsn = await call(`/api/hsn/${catering.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...catering, notes: originalNotes }),
  });
  check(restoredHsn.status === 200, "the HSN code was not restored");

  const partyName = `Smoke Customer ${stamp}`;
  const createdParty = await call("/api/parties", {
    method: "POST",
    body: JSON.stringify({ kind: "customer", name: partyName, gstin: GSTIN }),
  });
  check(createdParty.status === 201, `party create returned ${createdParty.status}: ${JSON.stringify(createdParty.body)}`);
  const party = createdParty.body as Row;
  partyId = Number(party.id);
  check(party.stateCode === "33", "the party state was not derived from the GSTIN");

  const duplicateParty = await call("/api/parties", {
    method: "POST",
    body: JSON.stringify({ kind: "customer", name: partyName, gstin: GSTIN }),
  });
  check(duplicateParty.status === 409, `duplicate party returned ${duplicateParty.status}`);

  const renamed = await call(`/api/parties/${partyId}`, {
    method: "PUT",
    body: JSON.stringify({ kind: "customer", name: `${partyName} LLP`, gstin: GSTIN }),
  });
  check(renamed.status === 200, `party update returned ${renamed.status}`);
  const found = (await call(`/api/parties?q=${encodeURIComponent("Smoke Customer")}`)).body as Row[];
  check(found.some((row) => row.id === partyId), "the party was not found by search");

  const restore = await call("/api/business", {
    method: "PUT",
    body: JSON.stringify(restoreBusiness),
  });
  check(restore.status === 200, `business restore returned ${restore.status}`);

  console.log("Masters smoke test passed against the real database.");
} finally {
  if (partyId !== null) {
    await sql`delete from parties where id = ${partyId}`;
  }
  await sql`delete from audit_log where user_email = ${email}`;
  await sql`delete from login_history where email = ${email}`;
  await sql`delete from users where email = ${email}`;
  await sql.end();
  console.log("Temporary smoke data removed.");
}
