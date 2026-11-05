import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { listSessions } from "@/server/auth-service";
import { sessionToken } from "@/server/cookies";
import { errorResponse, noStore } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await listSessions(db, await sessionToken());
    return noStore(NextResponse.json({ sessions: rows }));
  } catch (error) {
    return errorResponse(error);
  }
}
