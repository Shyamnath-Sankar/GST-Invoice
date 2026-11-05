import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { loginUser } from "@/server/auth-service";
import { setSessionCookie } from "@/server/cookies";
import {
  errorResponse,
  noStore,
  parseBody,
  readJson,
  requestMeta,
  requireCsrf,
} from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().min(1).max(200),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const body = parseBody(schema, await readJson(request));
    const result = await loginUser(db, { ...body, ...requestMeta(request) });
    await setSessionCookie(result.token);
    return noStore(NextResponse.json({ user: result.user }));
  } catch (error) {
    return errorResponse(error);
  }
}
