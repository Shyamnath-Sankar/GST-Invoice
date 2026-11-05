import { NextResponse } from "next/server";
import { z } from "zod";
import { calcDocument, SUPPLY_KINDS } from "@/lib/gst/gst";

const lineSchema = z.object({
  qty: z.number().finite().min(0),
  unitPricePaise: z.number().int(),
  gstRateBp: z.number().int().min(0).max(10000),
  discountPaise: z.number().int().min(0).optional(),
  supplyKind: z.enum(SUPPLY_KINDS).optional(),
  cessRateBp: z.number().int().min(0).max(10000).optional(),
  hsnSac: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  unit: z.string().max(20).optional(),
});

const bodySchema = z.object({
  lines: z.array(lineSchema).min(1).max(500),
  inclusive: z.boolean().optional(),
  interState: z.boolean().optional(),
  roundOff: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input" },
      { status: 422 },
    );
  }

  try {
    const document = calcDocument(parsed.data.lines, {
      inclusive: parsed.data.inclusive ?? false,
      interState: parsed.data.interState ?? false,
      roundOff: parsed.data.roundOff ?? false,
    });
    return NextResponse.json(document, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calculation failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
