import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/client";
import * as schema from "../src/db/schema";
import { auditLog, sessions, users } from "../src/db/schema";
import {
  changePassword,
  countUsers,
  createPasswordReset,
  listSessions,
  loginUser,
  logoutToken,
  requireOwner,
  requireSession,
  resetPassword,
  revokeSession,
  setupOwner,
  updateMe,
} from "../src/server/auth-service";
import { requireCsrf } from "../src/server/http";
import { hashPassword } from "../src/lib/auth";

process.env.BCRYPT_ROUNDS = "4";

const META = { ip: "127.0.0.1", userAgent: "vitest" };
const PASSWORD = "correct horse battery 1";
const EMAIL = "owner@example.com";

let client: PGlite;
let db: Db;

beforeAll(async () => {
  client = new PGlite();
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder: "./drizzle" });
  db = pglite as unknown as Db;
});

beforeEach(async () => {
  await client.exec(
    "truncate table users, sessions, login_history, password_resets, audit_log restart identity cascade",
  );
});

afterAll(async () => {
  await client.close();
});

async function makeOwner(): Promise<number> {
  const result = await setupOwner(db, {
    name: "Owner",
    email: EMAIL,
    password: PASSWORD,
    ...META,
  });
  return result.user.id;
}

describe("first setup", () => {
  it("creates the owner, signs them in and audits it", async () => {
    const result = await setupOwner(db, {
      name: "Owner",
      email: " OWNER@Example.com ",
      password: PASSWORD,
      ...META,
    });

    expect(result.user.email).toBe(EMAIL);
    expect(result.user.role).toBe("owner");
    expect(result.token).toHaveLength(43);
    expect(await countUsers(db)).toBe(1);

    const events = await db.select().from(auditLog);
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toContain("Owner account created");

    const context = await requireSession(db, result.token);
    expect(context.user.id).toBe(result.user.id);
  });

  it("rejects a second setup", async () => {
    await makeOwner();
    await expect(
      setupOwner(db, { name: "Other", email: "other@example.com", password: PASSWORD, ...META }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("validates the email, name and password", async () => {
    await expect(
      setupOwner(db, { name: "", email: "bad", password: "short", ...META }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      setupOwner(db, { name: "Owner", email: "bad", password: PASSWORD, ...META }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      setupOwner(db, { name: "Owner", email: EMAIL, password: "0123456789", ...META }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("login", () => {
  it("accepts the right password and records the attempt", async () => {
    await makeOwner();
    const result = await loginUser(db, { email: EMAIL, password: PASSWORD, ...META });
    expect(result.user.email).toBe(EMAIL);
    expect(await requireSession(db, result.token)).toBeTruthy();
  });

  it("rejects a wrong password and an inactive account", async () => {
    const ownerId = await makeOwner();
    await expect(
      loginUser(db, { email: EMAIL, password: "wrong password 1", ...META }),
    ).rejects.toMatchObject({ status: 401 });

    await db.update(users).set({ isActive: false }).where(eq(users.id, ownerId));
    await expect(
      loginUser(db, { email: EMAIL, password: PASSWORD, ...META }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throttles after eight failures in fifteen minutes", async () => {
    await makeOwner();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expect(
        loginUser(db, { email: EMAIL, password: "wrong password 1", ...META }),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      loginUser(db, { email: EMAIL, password: PASSWORD, ...META }),
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe("sessions", () => {
  it("rejects an expired or revoked session", async () => {
    const { token } = await setupOwner(db, {
      name: "Owner",
      email: EMAIL,
      password: PASSWORD,
      ...META,
    });

    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(requireSession(db, token)).rejects.toMatchObject({ status: 401 });

    await db.update(sessions).set({ expiresAt: new Date(Date.now() + 60_000) });
    await logoutToken(db, token, META);
    await expect(requireSession(db, token)).rejects.toMatchObject({ status: 401 });
  });

  it("lists only live sessions of the signed-in user and revokes own ones", async () => {
    const { token } = await setupOwner(db, {
      name: "Owner",
      email: EMAIL,
      password: PASSWORD,
      ...META,
    });
    await loginUser(db, { email: EMAIL, password: PASSWORD, ...META });

    const rows = await listSessions(db, token);
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.current)).toHaveLength(1);

    const other = rows.find((row) => !row.current);
    expect(other).toBeDefined();
    await revokeSession(db, token, other!.id);
    expect(await listSessions(db, token)).toHaveLength(1);

    await expect(revokeSession(db, token, 99999)).rejects.toMatchObject({ status: 404 });
  });

  it("requires the owner role only where asked", async () => {
    const { token } = await setupOwner(db, {
      name: "Owner",
      email: EMAIL,
      password: PASSWORD,
      ...META,
    });
    const owner = await requireSession(db, token);
    expect(() => requireOwner(owner)).not.toThrow();

    await db.insert(users).values({
      email: "accountant@example.com",
      name: "Accountant",
      role: "accountant",
      passwordHash: hashPassword(PASSWORD),
    });
    const accountant = await loginUser(db, {
      email: "accountant@example.com",
      password: PASSWORD,
      ...META,
    });
    const context = await requireSession(db, accountant.token);
    expect(() => requireOwner(context)).toThrow(/owner/i);
  });
});

describe("password reset", () => {
  it("accepts a reset link once and revokes sessions", async () => {
    const ownerId = await makeOwner();
    const { token: sessionToken } = await loginUser(db, {
      email: EMAIL,
      password: PASSWORD,
      ...META,
    });

    const resetToken = await createPasswordReset(db, ownerId);
    await resetPassword(db, { token: resetToken, newPassword: "a different pass 2" });
    await expect(requireSession(db, sessionToken)).rejects.toMatchObject({ status: 401 });

    await expect(
      resetPassword(db, { token: resetToken, newPassword: "another pass 3" }),
    ).rejects.toMatchObject({ status: 422 });

    const result = await loginUser(db, {
      email: EMAIL,
      password: "a different pass 2",
      ...META,
    });
    expect(result.user.id).toBe(ownerId);
  });

  it("rejects an unknown reset token", async () => {
    await makeOwner();
    await expect(
      resetPassword(db, { token: "not-a-token", newPassword: "a different pass 2" }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("profile and password changes", () => {
  it("changes the password and revokes the other sessions", async () => {
    const { token } = await setupOwner(db, {
      name: "Owner",
      email: EMAIL,
      password: PASSWORD,
      ...META,
    });
    const second = await loginUser(db, { email: EMAIL, password: PASSWORD, ...META });

    await changePassword(db, token, {
      currentPassword: PASSWORD,
      newPassword: "changed password 2",
    });

    await expect(requireSession(db, second.token)).rejects.toMatchObject({ status: 401 });
    expect(await requireSession(db, token)).toBeTruthy();
    await expect(
      loginUser(db, { email: EMAIL, password: "changed password 2", ...META }),
    ).resolves.toBeTruthy();
  });

  it("rejects a wrong current password", async () => {
    const { token } = await setupOwner(db, {
      name: "Owner",
      email: EMAIL,
      password: PASSWORD,
      ...META,
    });
    await expect(
      changePassword(db, token, { currentPassword: "nope nope 1", newPassword: "changed pass 2" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("updates the profile and refuses a duplicate email", async () => {
    const { token } = await setupOwner(db, {
      name: "Owner",
      email: EMAIL,
      password: PASSWORD,
      ...META,
    });
    const updated = await updateMe(db, token, { name: "New Name", email: "new@example.com" });
    expect(updated.name).toBe("New Name");
    expect(updated.email).toBe("new@example.com");

    await db.insert(users).values({
      email: "taken@example.com",
      name: "Taken",
      role: "accountant",
      passwordHash: hashPassword(PASSWORD),
    });
    await expect(updateMe(db, token, { email: "taken@example.com" })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("CSRF guard", () => {
  it("requires the X-Requested-With: fetch header", () => {
    const request = new Request("http://localhost/api/auth/login", { method: "POST" });
    expect(() => requireCsrf(request)).toThrow(/X-Requested-With/);

    const ok = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "x-requested-with": "fetch" },
    });
    expect(() => requireCsrf(ok)).not.toThrow();
  });
});
