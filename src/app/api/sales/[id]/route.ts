import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getSale, updateSale } from "@/server/sales-service";
import { salesSchema } from "@/server/doc-schema";
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
    const sale = await getSale(db, parsed.data);
    if (!sale) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return noStore(NextResponse.json(sale));
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
    const body = parseBody(salesSchema, await readJson(request));
    const updated = await updateSale(db, actorOf(session), parsed.data, body);
    return noStore(NextResponse.json(updated));
  } catch (error) {
    return errorResponse(error);
  }
}
