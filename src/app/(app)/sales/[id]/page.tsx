import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getBusiness } from "@/server/masters";
import { getSale } from "@/server/sales-service";
import { currentSession } from "@/server/route-auth";
import { isoToday } from "@/lib/docs";
import { amendSaleEditor, editorBusiness, saleEditor } from "@/server/editor-data";
import { formatINR } from "@/lib/money";
import { DocumentEditor } from "@/components/document-editor";
import { Attachments } from "@/components/attachments";
import { DocumentActions } from "@/components/doc-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SalePage({ params, searchParams }: PageProps) {
  const { id: rawId } = await params;
  const search = await searchParams;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const sale = await getSale(db, id);
  if (!sale) {
    notFound();
  }
  const business = await getBusiness(db);
  const session = await currentSession();
  const canDelete = session.user.role === "owner";

  if (search.edit === "1" && sale.status === "active") {
    return (
      <>
        <h1>Edit {sale.number}</h1>
        <DocumentEditor
          kind="sales"
          mode="edit"
          id={sale.id}
          initial={saleEditor(sale)}
          business={editorBusiness(business)}
        />
      </>
    );
  }

  if (search.amend === "1" && sale.status === "active" && !sale.amendedById) {
    return (
      <>
        <h1>Amend {sale.number}</h1>
        <DocumentEditor
          kind="sales"
          mode="amend"
          id={sale.id}
          initial={amendSaleEditor(sale, isoToday())}
          business={editorBusiness(business)}
        />
      </>
    );
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="grow">
          {sale.docType.replace("_", " ")} {sale.number}
        </h1>
        <span className="muted">{sale.status}</span>
        <Link href="/sales">← Sales</Link>
      </div>

      <section className="sheet">
        <div className="sheet-pad">
          <table>
            <tbody>
              <tr>
                <th>Date</th>
                <td>{sale.date}</td>
                <th>Type</th>
                <td>{sale.docType.replace("_", " ")}</td>
                <th>Section</th>
                <td>{sale.section.toUpperCase()}</td>
              </tr>
              <tr>
                <th>Party</th>
                <td>{sale.partyName}</td>
                <th>GSTIN</th>
                <td className="num">{sale.partyGstin || "—"}</td>
                <th>Place of supply</th>
                <td>{sale.placeOfSupply}</td>
              </tr>
              <tr>
                <th>Prices</th>
                <td>{sale.priceMode === "inclusive" ? "GST included" : "GST added"}</td>
                <th>Reverse charge</th>
                <td>{sale.reverseCharge ? "Yes" : "No"}</td>
                <th>Export</th>
                <td>{sale.isExport ? "Yes" : "No"}</td>
              </tr>
              {sale.docType !== "invoice" ? (
                <tr>
                  <th>Original</th>
                  <td>{sale.originalNumber || "—"}</td>
                  <th>Original date</th>
                  <td>{sale.originalDate || "—"}</td>
                  <th>Reason</th>
                  <td>{sale.noteReason || "—"}</td>
                </tr>
              ) : null}
              {sale.amendsId ? (
                <tr>
                  <th>Amends</th>
                  <td>
                    <Link href={`/sales/${sale.amendsId}`}>#{sale.amendsId}</Link>
                  </td>
                  <th>Amend period</th>
                  <td>{sale.amendPeriod || "—"}</td>
                  <th />
                  <td />
                </tr>
              ) : null}
              {sale.amendedById ? (
                <tr>
                  <th>Amended by</th>
                  <td>
                    <Link href={`/sales/${sale.amendedById}`}>#{sale.amendedById}</Link>
                  </td>
                  <th />
                  <td />
                  <th />
                  <td />
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
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((line) => (
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
                  <td className="num">{formatINR(line.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sheet-foot">
          <span className="muted small">
            <DocumentActions kind="sales" id={sale.id} status={sale.status} />
          </span>
          <span>
            {sale.status === "active" ? (
              <Link href={`/sales/${sale.id}?edit=1`}>Edit</Link>
            ) : null}{" "}
            <a href={`/api/sales/${sale.id}/pdf`} target="_blank" rel="noreferrer">
              Print PDF
            </a>
          </span>
        </div>
      </section>

      <section className="sheet">
        <div className="sheet-pad">
          <table className="narrow">
            <tbody>
              <tr>
                <th>Taxable value</th>
                <td className="num">{formatINR(sale.taxableValuePaise)}</td>
              </tr>
              <tr>
                <th>CGST</th>
                <td className="num">{formatINR(sale.cgstPaise)}</td>
              </tr>
              <tr>
                <th>SGST</th>
                <td className="num">{formatINR(sale.sgstPaise)}</td>
              </tr>
              <tr>
                <th>IGST</th>
                <td className="num">{formatINR(sale.igstPaise)}</td>
              </tr>
              {sale.cessPaise !== 0 ? (
                <tr>
                  <th>Cess</th>
                  <td className="num">{formatINR(sale.cessPaise)}</td>
                </tr>
              ) : null}
              {sale.roundOffPaise !== 0 ? (
                <tr>
                  <th>Round off</th>
                  <td className="num">{formatINR(sale.roundOffPaise)}</td>
                </tr>
              ) : null}
              <tr>
                <th>Total</th>
                <td className="num">{formatINR(sale.totalPaise)}</td>
              </tr>
            </tbody>
          </table>
          {sale.notes ? <p className="muted small">{sale.notes}</p> : null}
        </div>
      </section>

      <Attachments entityType="sale" entityId={sale.id} canDelete={canDelete} />
    </>
  );
}
