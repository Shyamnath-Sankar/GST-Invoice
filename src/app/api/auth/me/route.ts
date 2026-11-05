import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { publicUser, requireSession, updateMe } from "@/server/auth-service";
import { sessionToken } from "@/server/cookies";
import {
  errorResponse,
  noStore,
  parseBody,
  readJson,
  requireCsrf,
} from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().min(3).max(200).optional(),
});

export async function GET() {
  try {
    const context = await requireSession(db, await sessionToken());
    return noStore(NextResponse.json({ user: publicUser(context.user) }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    requireCsrf(request);
    const body = parseBody(schema, await readJson(request));
    const user = await updateMe(db, await sessionToken(), body);
    return noStore(NextResponse.json({ user }));
  } catch (error) {
    return errorResponse(error);
  }
}
