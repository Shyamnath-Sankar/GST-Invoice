import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { createSale, listSales, type SalesFilters } from "@/server/sales-service";
import { intParam, salesSchema } from "@/server/doc-schema";
import { actorOf, currentSession } from "@/server/route-auth";
import {
  errorResponse,
  noStore,
  parseBody,
  readJson,
  requireCsrf,
} from "@/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await currentSession();
    const params = new URL(request.url).searchParams;
    const filters: SalesFilters = {
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      q: params.get("q") ?? "",
      section: params.get("section") ?? "",
      docType: params.get("docType") ?? "",
      status: params.get("status") ?? "",
      page: intParam(params.get("page"), 1),
      size: intParam(params.get("size"), 50),
    };
    return noStore(NextResponse.json(await listSales(db, filters)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const session = await currentSession();
    const body = parseBody(salesSchema, await readJson(request));
    const created = await createSale(db, actorOf(session), body);
    return noStore(NextResponse.json(created, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
