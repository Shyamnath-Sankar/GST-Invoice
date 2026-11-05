import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { countUsers, findSession, publicUser } from "@/server/auth-service";
import { sessionToken } from "@/server/cookies";
import { errorResponse, noStore } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const token = await sessionToken();
    const context = await findSession(db, token);
    const needsSetup = (await countUsers(db)) === 0;
    return noStore(
      NextResponse.json({
        needsSetup,
        user: context ? publicUser(context.user) : null,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
