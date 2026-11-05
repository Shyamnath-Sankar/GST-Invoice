import { NextResponse } from "next/server";
import { z } from "zod";
import { checkGstin } from "@/server/masters";
import { currentSession } from "@/server/route-auth";
import { errorResponse, noStore, parseBody, readJson, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  gstin: z.string().max(20).optional(),
});

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    await currentSession();
    const body = parseBody(schema, await readJson(request));
    return noStore(NextResponse.json(checkGstin(body.gstin)));
  } catch (error) {
    return errorResponse(error);
  }
}
