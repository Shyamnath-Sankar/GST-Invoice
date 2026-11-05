import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { createParty, listParties } from "@/server/masters";
import { actorOf, currentSession } from "@/server/route-auth";
import { errorResponse, noStore, parseBody, readJson, requireCsrf } from "@/server/http";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["customer", "supplier"]),
  name: z.string().max(200),
  gstin: z.string().max(20).optional(),
  address: z.string().max(1000).optional(),
  stateCode: z.string().max(2).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    await currentSession();
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind");
    const filteredKind =
      kind === "customer" || kind === "supplier" ? kind : undefined;
    if (kind && !filteredKind) {
      return NextResponse.json({ error: "Kind must be customer or supplier" }, { status: 422 });
    }
    return noStore(
      NextResponse.json(
        await listParties(db, {
          kind: filteredKind,
          q: params.get("q") ?? "",
          includeInactive: params.get("includeInactive") === "true",
        }),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const session = await currentSession();
    const body = parseBody(schema, await readJson(request));
    const created = await createParty(db, actorOf(session), body);
    return noStore(NextResponse.json(created, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
