import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getBusiness } from "@/server/masters";
import { getSale } from "@/server/sales-service";
import { salesPdfDoc } from "@/server/doc-mapper";
import { renderCreditNotePdf, renderSalesPdf, type InvoiceBusiness } from "@/lib/invoice-pdf";
import { currentSession } from "@/server/route-auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

const idSchema = z.coerce.number().int().positive();

function printableName(number: string): string {
  return number.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "invoice";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await currentSession();
    const parsed = idSchema.safeParse((await context.params).id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const sale = await getSale(db, parsed.data);
    if (!sale) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const settings = await getBusiness(db);
    const business: InvoiceBusiness = {
      legalName: settings.legalName,
      tradeName: settings.tradeName,
      gstin: settings.gstin,
      pan: settings.pan,
      address: settings.address,
      stateCode: settings.stateCode,
      phone: settings.phone,
      email: settings.email,
      proprietor: settings.proprietor,
    };
    const document = salesPdfDoc(sale);
    const bytes =
      document.docType === "credit_note"
        ? await renderCreditNotePdf(document, business)
        : await renderSalesPdf(document, business);

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${printableName(document.number)}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
