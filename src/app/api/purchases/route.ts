import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { createPurchase, listPurchases, type PurchaseFilters } from "@/server/purchase-service";
import { intParam, purchaseSchema } from "@/server/doc-schema";
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
    const filters: PurchaseFilters = {
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      q: params.get("q") ?? "",
      category: params.get("category") ?? "",
      itc: params.get("itc") ?? "",
      recon: params.get("recon") ?? "",
      status: params.get("status") ?? "",
      page: intParam(params.get("page"), 1),
      size: intParam(params.get("size"), 50),
    };
    return noStore(NextResponse.json(await listPurchases(db, filters)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const session = await currentSession();
    const body = parseBody(purchaseSchema, await readJson(request));
    const created = await createPurchase(db, actorOf(session), body);
    return noStore(NextResponse.json(created, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
