import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { cancelSale } from "@/server/sales-service";
import { actorOf, currentSession } from "@/server/route-auth";
import { errorResponse, noStore, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const idSchema = z.coerce.number().int().positive();

export async function POST(
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
    return noStore(NextResponse.json(await cancelSale(db, actorOf(session), parsed.data)));
  } catch (error) {
    return errorResponse(error);
  }
}
