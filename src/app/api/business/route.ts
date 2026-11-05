import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getBusiness, updateBusiness } from "@/server/masters";
import { actorOf, currentOwner, currentSession } from "@/server/route-auth";
import { errorResponse, noStore, parseBody, readJson, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  legalName: z.string().max(200).optional(),
  tradeName: z.string().max(200).optional(),
  gstin: z.string().max(20).optional(),
  pan: z.string().max(10).optional(),
  address: z.string().max(1000).optional(),
  stateCode: z.string().length(2).optional(),
  jurisdiction: z.string().max(200).optional(),
  registrationType: z.enum(["regular", "composition"]).optional(),
  filingFrequency: z.enum(["monthly", "quarterly"]).optional(),
  fyStartYear: z.number().int().optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  proprietor: z.string().max(200).optional(),
  invoicePrefix: z.string().max(40).optional(),
  b2clLimitPaise: z.number().int().min(0).optional(),
  noItcScheme: z.boolean().optional(),
  roundOff: z.boolean().optional(),
  defaultPriceMode: z.enum(["exclusive", "inclusive"]).optional(),
});

export async function GET() {
  try {
    await currentSession();
    return noStore(NextResponse.json(await getBusiness(db)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    requireCsrf(request);
    const context = await currentOwner();
    const body = parseBody(schema, await readJson(request));
    const updated = await updateBusiness(db, actorOf(context), body);
    return noStore(NextResponse.json(updated));
  } catch (error) {
    return errorResponse(error);
  }
}
