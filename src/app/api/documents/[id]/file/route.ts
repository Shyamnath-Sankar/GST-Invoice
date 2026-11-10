import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { downloadDocument } from "@/server/document-service";
import { currentSession } from "@/server/route-auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

const idSchema = z.coerce.number().int().positive();

function filenameHeader(name: string): string {
  const safe = name.replace(/[^\w.\- ]+/g, "_").slice(0, 150) || "attachment";
  return `attachment; filename="${safe}"`;
}

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
    const file = await downloadDocument(db, parsed.data);
    return new NextResponse(Buffer.from(file.body), {
      status: 200,
      headers: {
        "content-type": file.contentType || file.row.mimeType,
        "content-length": String(file.body.byteLength),
        "content-disposition": filenameHeader(file.row.filename),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
