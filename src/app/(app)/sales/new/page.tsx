import { db } from "@/db/client";
import { getBusiness } from "@/server/masters";
import { nextSalesNumber } from "@/server/sales-service";
import { isoToday } from "@/lib/docs";
import { editorBusiness, newSalesEditor } from "@/server/editor-data";
import { DocumentEditor } from "@/components/document-editor";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  const business = await getBusiness(db);
  const today = isoToday();
  const number = await nextSalesNumber(db);
  return (
    <>
      <h1>New sale</h1>
      <p className="muted">Invoice, credit note or debit note. Totals come from the server.</p>
      <DocumentEditor
        kind="sales"
        mode="new"
        initial={newSalesEditor(business, number, today)}
        business={editorBusiness(business)}
      />
    </>
  );
}
