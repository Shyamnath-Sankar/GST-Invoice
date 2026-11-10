import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { deleteDocument, getDocument } from "@/server/document-service";
import { actorOf, currentSession } from "@/server/route-auth";
import { errorResponse, noStore, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const idSchema = z.coerce.number().int().positive();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await currentSession();
    const parsed = idSchema.safeParse((await context.params).id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = await getDocument(db, parsed.data);
    if (!row) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }
    return noStore(NextResponse.json(row));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireCsrf(request);
    const session = await currentSession();
    const parsed = idSchema.safeParse((await context.params).id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await deleteDocument(
      db,
      { ...actorOf(session), role: session.user.role },
      parsed.data,
    );
    return noStore(NextResponse.json({ ok: true }));
  } catch (error) {
    return errorResponse(error);
  }
}
