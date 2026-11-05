import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { updateParty } from "@/server/masters";
import { actorOf, currentSession } from "@/server/route-auth";
import { errorResponse, noStore, parseBody, readJson, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["customer", "supplier"]),
  name: z.string().max(200),
  gstin: z.string().max(20).optional(),
  address: z.string().max(1000).optional(),
  stateCode: z.string().max(2).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
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
    const updated = await updateParty(db, actorOf(session), parsedId.data, body);
    return noStore(NextResponse.json(updated));
  } catch (error) {
    return errorResponse(error);
  }
}
