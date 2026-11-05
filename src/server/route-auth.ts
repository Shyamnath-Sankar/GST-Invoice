/** Session helpers for route handlers. Roles are enforced here, not in services. */
import { db } from "@/db/client";
import type { Actor } from "./actor";
import type { SessionContext } from "./auth-service";
import { requireOwner, requireSession } from "./auth-service";
import { sessionToken } from "./cookies";

export async function currentSession(): Promise<SessionContext> {
  return requireSession(db, await sessionToken());
}

export async function currentOwner(): Promise<SessionContext> {
  const context = await currentSession();
  requireOwner(context);
  return context;
}

export function actorOf(context: SessionContext): Actor {
  return { id: context.user.id, email: context.user.email };
}
