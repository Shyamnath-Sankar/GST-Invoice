/**
 * Authentication and session logic. Every function takes the database so it can be
 * exercised against PGlite in tests; route handlers pass the real client.
 */
import { and, count, desc, eq, gt, ne } from "drizzle-orm";
import { loginHistory, passwordResets, sessions, users } from "@/db/schema";
import type { Db } from "@/db/client";
import type { UserRole } from "@/db/schema";
import { hashPassword, newToken, passwordProblem, tokenHash, verifyPassword } from "@/lib/auth";
import { ApiError } from "./errors";
import { audit } from "./audit";

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

type UserRow = typeof users.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

export function publicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new ApiError(422, "Enter a valid email");
  }
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) {
    throw new ApiError(422, "Enter a name of 1 to 120 characters");
  }
  return trimmed;
}

function sessionHours(): number {
  const configured = Number(process.env.SESSION_HOURS ?? "12");
  return Number.isFinite(configured) && configured > 0 ? configured : 12;
}

async function createSessionRecord(
  db: Db,
  userId: number,
  meta: RequestMeta,
): Promise<string> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + sessionHours() * 60 * 60 * 1000);
  await db.insert(sessions).values({
    tokenHash: tokenHash(token),
    userId,
    expiresAt,
    ip: meta.ip.slice(0, 64),
    userAgent: meta.userAgent.slice(0, 300),
  });
  return token;
}

export async function countUsers(db: Db): Promise<number> {
  const [row] = await db.select({ value: count() }).from(users);
  return row?.value ?? 0;
}

export async function setupOwner(
  db: Db,
  input: { name: string; email: string; password: string } & RequestMeta,
): Promise<{ user: PublicUser; token: string }> {
  if ((await countUsers(db)) > 0) {
    throw new ApiError(409, "Setup is already done. Sign in instead");
  }
  const email = normaliseEmail(input.email);
  assertEmail(email);
  const name = assertName(input.name);
  const problem = passwordProblem(input.password);
  if (problem) {
    throw new ApiError(422, problem);
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      name,
      role: "owner",
      passwordHash: hashPassword(input.password),
    })
    .returning();

  if (!user) {
    throw new ApiError(500, "Could not create the owner account");
  }

  await audit(db, {
    userId: user.id,
    userEmail: user.email,
    action: "create",
    entityType: "user",
    entityId: user.id,
    summary: "Owner account created at first setup",
  });

  const token = await createSessionRecord(db, user.id, input);
  return { user: publicUser(user), token };
}

export async function loginUser(
  db: Db,
  input: { email: string; password: string } & RequestMeta,
): Promise<{ user: PublicUser; token: string }> {
  const email = normaliseEmail(input.email);
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);

  const [failures] = await db
    .select({ value: count() })
    .from(loginHistory)
    .where(
      and(
        eq(loginHistory.email, email),
        eq(loginHistory.success, false),
        gt(loginHistory.at, cutoff),
      ),
    );

  if ((failures?.value ?? 0) >= 8) {
    throw new ApiError(429, "Too many wrong attempts. Wait 15 minutes and try again");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !verifyPassword(input.password, user.passwordHash) || !user.isActive) {
    await db.insert(loginHistory).values({
      userId: user?.id ?? null,
      email,
      success: false,
      ip: input.ip.slice(0, 64),
      userAgent: input.userAgent.slice(0, 300),
    });
    throw new ApiError(
      401,
      user && !user.isActive
        ? "This account is switched off. Ask the owner"
        : "That email and password do not match",
    );
  }

  await db.insert(loginHistory).values({
    userId: user.id,
    email,
    success: true,
    ip: input.ip.slice(0, 64),
    userAgent: input.userAgent.slice(0, 300),
  });

  const token = await createSessionRecord(db, user.id, input);
  return { user: publicUser(user), token };
}

export interface SessionContext {
  session: SessionRow;
  user: UserRow;
}

export async function findSession(db: Db, token: string | null | undefined): Promise<SessionContext | null> {
  if (!token) {
    return null;
  }
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash(token)))
    .limit(1);

  if (!session || session.revoked || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || !user.isActive) {
    return null;
  }

  if (Date.now() - session.lastSeen.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeen: new Date() }).where(eq(sessions.id, session.id));
  }

  return { session, user };
}

export async function requireSession(db: Db, token: string | null | undefined): Promise<SessionContext> {
  const context = await findSession(db, token);
  if (!context) {
    throw new ApiError(401, "Please sign in");
  }
  return context;
}

export function requireOwner(context: SessionContext): void {
  if (context.user.role !== "owner") {
    throw new ApiError(403, "Only the owner can do this");
  }
}

export async function logoutToken(
  db: Db,
  token: string | null | undefined,
  meta: RequestMeta,
): Promise<void> {
  if (!token) {
    return;
  }
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash(token)))
    .limit(1);
  if (!session) {
    return;
  }
  await db.update(sessions).set({ revoked: true }).where(eq(sessions.id, session.id));
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (user) {
    await db.insert(loginHistory).values({
      userId: user.id,
      email: user.email,
      success: true,
      event: "logout",
      ip: meta.ip.slice(0, 64),
      userAgent: meta.userAgent.slice(0, 300),
    });
  }
}

export async function changePassword(
  db: Db,
  token: string | null | undefined,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const { session, user } = await requireSession(db, token);
  if (!verifyPassword(input.currentPassword, user.passwordHash)) {
    throw new ApiError(422, "Current password is wrong");
  }
  const problem = passwordProblem(input.newPassword);
  if (problem) {
    throw new ApiError(422, problem);
  }

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(input.newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  await db
    .update(sessions)
    .set({ revoked: true })
    .where(and(eq(sessions.userId, user.id), ne(sessions.id, session.id)));

  await audit(db, {
    userId: user.id,
    userEmail: user.email,
    action: "update",
    entityType: "user",
    entityId: user.id,
    summary: "Changed own password",
  });
}

export async function resetPassword(
  db: Db,
  input: { token: string; newPassword: string },
): Promise<void> {
  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash(input.token)))
    .limit(1);

  if (!reset || reset.used || reset.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(422, "This reset link has expired. Ask the owner for a new one");
  }
  const problem = passwordProblem(input.newPassword);
  if (problem) {
    throw new ApiError(422, problem);
  }

  const [user] = await db.select().from(users).where(eq(users.id, reset.userId)).limit(1);
  if (!user) {
    throw new ApiError(422, "This reset link has expired. Ask the owner for a new one");
  }

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(input.newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await db.update(passwordResets).set({ used: true }).where(eq(passwordResets.id, reset.id));
  await db.update(sessions).set({ revoked: true }).where(eq(sessions.userId, user.id));
  await db.insert(loginHistory).values({
    userId: user.id,
    email: user.email,
    success: true,
    event: "reset",
  });
  await audit(db, {
    userId: user.id,
    userEmail: user.email,
    action: "update",
    entityType: "user",
    entityId: user.id,
    summary: "Password reset with link",
  });
}

export async function createPasswordReset(
  db: Db,
  userId: number,
  hours = 24,
): Promise<string> {
  const token = newToken();
  await db.insert(passwordResets).values({
    userId,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
  });
  return token;
}

export interface SessionSummary {
  id: number;
  createdAt: string;
  lastSeen: string;
  ip: string;
  userAgent: string;
  current: boolean;
}

export async function listSessions(
  db: Db,
  token: string | null | undefined,
): Promise<SessionSummary[]> {
  const { session } = await requireSession(db, token);
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, session.userId),
        eq(sessions.revoked, false),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sessions.lastSeen));

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lastSeen: row.lastSeen.toISOString(),
    ip: row.ip,
    userAgent: row.userAgent,
    current: row.id === session.id,
  }));
}

export async function revokeSession(
  db: Db,
  token: string | null | undefined,
  sessionId: number,
): Promise<void> {
  const { session } = await requireSession(db, token);
  const [target] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!target || target.userId !== session.userId) {
    throw new ApiError(404, "Not found");
  }
  await db.update(sessions).set({ revoked: true }).where(eq(sessions.id, target.id));
}

export async function updateMe(
  db: Db,
  token: string | null | undefined,
  patch: { name?: string; email?: string },
): Promise<PublicUser> {
  const { user } = await requireSession(db, token);
  const before = publicUser(user);

  const changes: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    changes.name = assertName(patch.name);
  }
  if (patch.email !== undefined) {
    const email = normaliseEmail(patch.email);
    assertEmail(email);
    if (email !== user.email) {
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing) {
        throw new ApiError(409, "Someone already uses this email");
      }
    }
    changes.email = email;
  }

  const [updated] = await db
    .update(users)
    .set(changes)
    .where(eq(users.id, user.id))
    .returning();

  if (!updated) {
    throw new ApiError(404, "Not found");
  }

  await audit(db, {
    userId: user.id,
    userEmail: user.email,
    action: "update",
    entityType: "user",
    entityId: user.id,
    summary: "Updated own profile",
    before,
    after: publicUser(updated),
  });

  return publicUser(updated);
}
