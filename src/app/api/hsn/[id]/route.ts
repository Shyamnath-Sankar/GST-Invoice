import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { updateHsn } from "@/server/masters";
import { actorOf, currentSession } from "@/server/route-auth";
import { errorResponse, noStore, parseBody, readJson, requireCsrf } from "@/server/http";
import { SUPPLY_KINDS } from "@/lib/gst/gst";
import { UQC } from "@/lib/gst/hsn";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().max(8),
  description: z.string().max(500),
  isService: z.boolean().optional(),
  defaultRateBp: z.number().int().min(0).max(10_000),
  supplyKind: z.enum(SUPPLY_KINDS).optional(),
  uqc: z.enum(UQC).optional(),
  itcAllowed: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  active: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireCsrf(request);
    const session = await currentSession();
    const parsedId = z.coerce.number().int().positive().safeParse((await context.params).id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = parseBody(schema, await readJson(request));
    const updated = await updateHsn(db, actorOf(session), parsedId.data, body);
    return noStore(NextResponse.json(updated));
  } catch (error) {
    return errorResponse(error);
  }
}
