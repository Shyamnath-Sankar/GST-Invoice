import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ApiError } from "./errors";

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".");
    const message = issue
      ? path
        ? `${path}: ${issue.message}`
        : issue.message
      : "Invalid input";
    throw new ApiError(422, message);
  }
  return result.data;
}

export function requireCsrf(request: Request): void {
  if (request.headers.get("x-requested-with") !== "fetch") {
    throw new ApiError(403, "Missing X-Requested-With header");
  }
}

export function requestMeta(request: Request): { ip: string; userAgent: string } {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? (forwarded.split(",")[0] ?? "").trim() : "";
  return {
    ip: ip.slice(0, 64),
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
  };
}

export function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
