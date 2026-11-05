import { NextResponse } from "next/server";
import { z } from "zod";
import {
  calcDocument,
  classifySalesDoc,
  DEFAULT_B2CL_LIMIT_PAISE,
  SUPPLY_KINDS,
} from "@/lib/gst/gst";

const lineSchema = z.object({
  qty: z.number().finite().positive(),
  unitPricePaise: z.number().int().min(0),
  gstRateBp: z.number().int().min(0).max(10000),
  discountPaise: z.number().int().min(0).optional(),
  supplyKind: z.enum(SUPPLY_KINDS).optional(),
  cessRateBp: z.number().int().min(0).max(10000).optional(),
  hsnSac: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  unit: z.string().max(20).optional(),
});

const bodySchema = z.object({
  kind: z.enum(["sales", "purchase"]).optional(),
  docType: z.enum(["invoice", "credit_note", "debit_note"]).optional(),
  partyGstin: z.string().max(20).optional(),
  isExport: z.boolean().optional(),
  exportWithIgst: z.boolean().optional(),
  b2clLimitPaise: z.number().int().min(0).optional(),
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
    const input = parsed.data;
    const interState = input.interState ?? false;
    const isExport = input.isExport ?? false;
    const document = calcDocument(input.lines, {
      inclusive: input.inclusive ?? false,
      interState,
      isExport,
      exportWithIgst: input.exportWithIgst ?? false,
      roundOff: input.roundOff ?? false,
    });
    const section =
      (input.kind ?? "sales") === "sales"
        ? classifySalesDoc({
            docType: input.docType ?? "invoice",
            partyGstin: input.partyGstin ?? "",
            interState,
            totalPaise: document.totalPaise,
            b2clLimitPaise: input.b2clLimitPaise ?? DEFAULT_B2CL_LIMIT_PAISE,
            isExport,
          })
        : null;
    return NextResponse.json(
      { ...document, section },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calculation failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
