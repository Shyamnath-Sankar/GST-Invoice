import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getBusiness } from "@/server/masters";
import { getPurchase } from "@/server/purchase-service";
import { currentSession } from "@/server/route-auth";
import { editorBusiness, purchaseEditor } from "@/server/editor-data";
import { formatINR } from "@/lib/money";
import { DocumentEditor } from "@/components/document-editor";
import { Attachments } from "@/components/attachments";
import { DocumentActions } from "@/components/doc-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PurchasePage({ params, searchParams }: PageProps) {
  const { id: rawId } = await params;
  const search = await searchParams;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const purchase = await getPurchase(db, id);
  if (!purchase) {
    notFound();
  }
  const business = await getBusiness(db);
  const session = await currentSession();
  const canDelete = session.user.role === "owner";

  if (search.edit === "1" && purchase.status === "active") {
    return (
      <>
        <h1>Edit {purchase.number}</h1>
        <DocumentEditor
          kind="purchase"
          mode="edit"
          id={purchase.id}
          initial={purchaseEditor(purchase)}
          business={editorBusiness(business)}
        />
      </>
    );
  }

  const eligibleItcPaise = purchase.lines.reduce((sum, line) => {
    if (!line.itcEligible) {
      return sum;
    }
    return (
      sum + line.cgstPaise + line.sgstPaise + line.igstPaise + line.cessPaise
    );
  }, 0);

  return (
    <>
      <div className="toolbar">
        <h1 className="grow">
          {purchase.docType.replace("_", " ")} {purchase.number}
        </h1>
        <span className="muted">{purchase.status}</span>
        <Link href="/purchases">← Purchases</Link>
      </div>

      <section className="sheet">
        <div className="sheet-pad">
          <table>
            <tbody>
              <tr>
                <th>Date</th>
                <td>{purchase.date}</td>
                <th>Type</th>
                <td>{purchase.docType.replace("_", " ")}</td>
                <th>Category</th>
                <td>{purchase.category.replace("_", " ")}</td>
              </tr>
              <tr>
                <th>Supplier</th>
                <td>{purchase.supplierName}</td>
                <th>GSTIN</th>
                <td className="num">{purchase.supplierGstin || "—"}</td>
                <th>Place of supply</th>
                <td>{purchase.placeOfSupply}</td>
              </tr>
              <tr>
                <th>ITC period</th>
                <td>{purchase.itcPeriod}</td>
                <th>Prices</th>
                <td>{purchase.priceMode === "inclusive" ? "GST included" : "GST added"}</td>
                <th>Reverse charge</th>
                <td>{purchase.reverseCharge ? "Yes" : "No"}</td>
              </tr>
              {purchase.docType !== "invoice" ? (
                <tr>
                  <th>Original</th>
                  <td>{purchase.originalNumber || "—"}</td>
                  <th>Original date</th>
                  <td>{purchase.originalDate || "—"}</td>
                  <th>Reason</th>
                  <td>{purchase.noteReason || "—"}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet">
        <div className="sheet-pad">
          <h2>Lines</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HSN</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Taxable</th>
                <th>GST</th>
                <th>CGST</th>
                <th>SGST</th>
                <th>IGST</th>
                <th>ITC</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {purchase.lines.map((line) => (
                <tr key={line.id}>
                  <td className="num">{line.position + 1}</td>
                  <td>{line.description || "—"}</td>
                  <td>{line.hsnSac || "—"}</td>
                  <td className="num">
                    {Number(line.qty)} {line.unit}
                  </td>
                  <td className="num">{formatINR(line.unitPricePaise)}</td>
                  <td className="num">{formatINR(line.taxableValuePaise)}</td>
                  <td className="num">{line.gstRateBp / 100}%</td>
                  <td className="num">{formatINR(line.cgstPaise)}</td>
                  <td className="num">{formatINR(line.sgstPaise)}</td>
                  <td className="num">{formatINR(line.igstPaise)}</td>
                  <td>{line.itcEligible ? "Eligible" : `Blocked${line.itcReason ? `: ${line.itcReason}` : ""}`}</td>
                  <td className="num">{formatINR(line.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sheet-foot">
          <span className="muted small">
            <DocumentActions kind="purchase" id={purchase.id} status={purchase.status} />
          </span>
          <span>
            {purchase.status === "active" ? (
              <Link href={`/purchases/${purchase.id}?edit=1`}>Edit</Link>
            ) : null}
          </span>
        </div>
      </section>

      <section className="sheet">
        <div className="sheet-pad">
          <table className="narrow">
            <tbody>
              <tr>
                <th>Taxable value</th>
                <td className="num">{formatINR(purchase.taxableValuePaise)}</td>
              </tr>
              <tr>
                <th>CGST</th>
                <td className="num">{formatINR(purchase.cgstPaise)}</td>
              </tr>
              <tr>
                <th>SGST</th>
                <td className="num">{formatINR(purchase.sgstPaise)}</td>
              </tr>
              <tr>
                <th>IGST</th>
                <td className="num">{formatINR(purchase.igstPaise)}</td>
              </tr>
              {purchase.cessPaise !== 0 ? (
                <tr>
                  <th>Cess</th>
                  <td className="num">{formatINR(purchase.cessPaise)}</td>
                </tr>
              ) : null}
              {purchase.roundOffPaise !== 0 ? (
                <tr>
                  <th>Round off</th>
                  <td className="num">{formatINR(purchase.roundOffPaise)}</td>
                </tr>
              ) : null}
              <tr>
                <th>Total</th>
                <td className="num">{formatINR(purchase.totalPaise)}</td>
              </tr>
              <tr>
                <th>Eligible ITC</th>
                <td className="num">{formatINR(eligibleItcPaise)}</td>
              </tr>
            </tbody>
          </table>
          {purchase.notes ? <p className="muted small">{purchase.notes}</p> : null}
        </div>
      </section>

      <Attachments entityType="purchase" entityId={purchase.id} canDelete={canDelete} />
    </>
  );
}
