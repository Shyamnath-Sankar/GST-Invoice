import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { amendSale } from "@/server/sales-service";
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
    const body = parseBody(salesSchema, await readJson(request));
    const amended = await amendSale(db, actorOf(session), parsed.data, body);
    return noStore(NextResponse.json(amended, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
