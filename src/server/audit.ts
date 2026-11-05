import { auditLog } from "@/db/schema";
import type { Db } from "@/db/client";

export interface AuditInput {
  userId?: number | null;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

export async function audit(db: Db, input: AuditInput): Promise<void> {
  await db.insert(auditLog).values({
    userId: input.userId ?? null,
    userEmail: input.userEmail ?? "",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId === undefined ? "" : String(input.entityId),
    summary: input.summary ?? "",
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
