import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { nextSalesNumber } from "@/server/sales-service";
import { DOC_TYPES } from "@/lib/docs";
import { currentSession } from "@/server/route-auth";
import { errorResponse, noStore } from "@/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await currentSession();
    const raw = new URL(request.url).searchParams.get("docType") ?? "invoice";
    const parsed = z.enum(DOC_TYPES).safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Unknown document type" }, { status: 422 });
    }
    return noStore(NextResponse.json({ number: await nextSalesNumber(db, parsed.data) }));
  } catch (error) {
    return errorResponse(error);
  }
}
