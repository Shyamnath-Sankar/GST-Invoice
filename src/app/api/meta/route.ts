import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { getMeta } from "@/server/masters";
import { currentSession } from "@/server/route-auth";
import { errorResponse, noStore } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    await currentSession();
    return noStore(NextResponse.json(await getMeta(db)));
  } catch (error) {
    return errorResponse(error);
  }
}
