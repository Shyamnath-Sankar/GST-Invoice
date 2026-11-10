import { db } from "@/db/client";
import { getBusiness } from "@/server/masters";
import { isoToday } from "@/lib/docs";
import { editorBusiness, newPurchaseEditor } from "@/server/editor-data";
import { DocumentEditor } from "@/components/document-editor";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const business = await getBusiness(db);
  const today = isoToday();
  return (
    <>
      <h1>New purchase bill</h1>
      <p className="muted">
        Record a supplier bill. ITC is computed by the server from the bill and the ITC period.
      </p>
      <DocumentEditor
        kind="purchase"
        mode="new"
        initial={newPurchaseEditor(business, today)}
        business={editorBusiness(business)}
      />
    </>
  );
}
