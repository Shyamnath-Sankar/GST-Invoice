import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { createTaxRate, listTaxRates } from "@/server/masters";
import { actorOf, currentOwner, currentSession } from "@/server/route-auth";
import { errorResponse, noStore, parseBody, readJson, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  rateBp: z.number().int().min(0).max(10_000),
  label: z.string().max(200).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  try {
    await currentSession();
    return noStore(NextResponse.json(await listTaxRates(db)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const context = await currentOwner();
    const body = parseBody(schema, await readJson(request));
    const created = await createTaxRate(db, actorOf(context), body);
    return noStore(NextResponse.json(created, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
