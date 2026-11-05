import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { createHsn, listHsn } from "@/server/masters";
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

export async function GET(request: Request) {
  try {
    await currentSession();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return noStore(NextResponse.json(await listHsn(db, q)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const session = await currentSession();
    const body = parseBody(schema, await readJson(request));
    const created = await createHsn(db, actorOf(session), body);
    return noStore(NextResponse.json(created, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
