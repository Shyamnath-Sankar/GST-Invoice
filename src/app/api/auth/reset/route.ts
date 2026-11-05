import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { resetPassword } from "@/server/auth-service";
import { errorResponse, parseBody, readJson, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const body = parseBody(schema, await readJson(request));
    await resetPassword(db, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
