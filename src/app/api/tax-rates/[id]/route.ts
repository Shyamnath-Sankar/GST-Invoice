import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { updateTaxRate } from "@/server/masters";
import { actorOf, currentOwner } from "@/server/route-auth";
import { errorResponse, noStore, parseBody, readJson, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  rateBp: z.number().int().min(0).max(10_000).optional(),
  label: z.string().max(200).optional(),
  active: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireCsrf(request);
    const session = await currentOwner();
    const parsedId = z.coerce.number().int().positive().safeParse((await context.params).id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = parseBody(schema, await readJson(request));
    const updated = await updateTaxRate(db, actorOf(session), parsedId.data, body);
    return noStore(NextResponse.json(updated));
  } catch (error) {
    return errorResponse(error);
  }
}
