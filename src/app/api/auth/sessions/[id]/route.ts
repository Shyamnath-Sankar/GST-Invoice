import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { revokeSession } from "@/server/auth-service";
import { sessionToken } from "@/server/cookies";
import { errorResponse, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireCsrf(request);
    const { id } = await context.params;
    const parsed = z.coerce.number().int().positive().safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await revokeSession(db, await sessionToken(), parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
