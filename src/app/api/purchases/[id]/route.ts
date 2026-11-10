import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getPurchase, updatePurchase } from "@/server/purchase-service";
import { purchaseSchema } from "@/server/doc-schema";
import { actorOf, currentSession } from "@/server/route-auth";
import {
  errorResponse,
  noStore,
  parseBody,
  readJson,
  requireCsrf,
} from "@/server/http";

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
    const purchase = await getPurchase(db, parsed.data);
    if (!purchase) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }
    return noStore(NextResponse.json(purchase));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
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
    const body = parseBody(purchaseSchema, await readJson(request));
    const updated = await updatePurchase(db, actorOf(session), parsed.data, body);
    return noStore(NextResponse.json(updated));
  } catch (error) {
    return errorResponse(error);
  }
}
