/**
 * End-to-end smoke test against a running server and the real database:
 * setup -> status -> me -> logout -> me. The temporary owner is removed again.
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const base = process.env.SMOKE_URL ?? "http://localhost:3100";
const email = `smoke-${Date.now()}@example.com`;
const password = `smoke pass ${randomBytes(6).toString("hex")}`;
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
  return {
    status: response.status,
    body: text === "" ? null : JSON.parse(text),
  };
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("No database URL");
}
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });

try {
  const status = await call("/api/auth/status");
  check(status.status === 200, `status returned ${status.status}`);
  const before = status.body as { needsSetup: boolean };
  check(before.needsSetup, "the database already has a user; clean it first");

  const setup = await call("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke Owner", email, password }),
  });
  check(setup.status === 200, `setup returned ${setup.status}: ${JSON.stringify(setup.body)}`);
  check(cookie.includes("gst_session="), "setup did not set a session cookie");

  const signedIn = await call("/api/auth/status");
  const after = signedIn.body as {
    needsSetup: boolean;
    user: { email: string; role: string } | null;
  };
  check(!after.needsSetup, "setup did not stick");
  check(after.user?.email === email, "status did not return the signed-in user");
  check(after.user?.role === "owner", "the first user is not the owner");

  const me = await call("/api/auth/me");
  check(me.status === 200, `me returned ${me.status}`);

  const logout = await call("/api/auth/logout", { method: "POST" });
  check(logout.status === 200, `logout returned ${logout.status}`);

  const signedOut = await call("/api/auth/me");
  check(signedOut.status === 401, `me after logout returned ${signedOut.status}`);

  console.log("Auth smoke test passed against the real database.");
} finally {
  await sql`delete from audit_log where user_email = ${email}`;
  await sql`delete from login_history where email = ${email}`;
  await sql`delete from users where email = ${email}`;
  await sql.end();
  console.log("Temporary smoke user removed.");
}
