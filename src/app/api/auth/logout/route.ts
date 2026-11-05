import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { logoutToken } from "@/server/auth-service";
import { clearSessionCookie, sessionToken } from "@/server/cookies";
import { errorResponse, requestMeta, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const token = await sessionToken();
    await logoutToken(db, token, requestMeta(request));
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
