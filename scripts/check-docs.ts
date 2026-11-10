/**
 * Real-Neon smoke test for Phase 5: create a sale and a purchase inside a
 * transaction, read them back, render an invoice PDF, then roll everything back.
 * Nothing is persisted, so it is safe to run against the production branch.
 *
 *   NODE_OPTIONS=--require=./scripts/dns-patch.cjs npx tsx scripts/check-docs.ts
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const ROLLBACK = new Error("rollback");

async function main() {
  const { db, pgClient } = await import("../src/db/client");
  const { users } = await import("../src/db/schema");
  const { getBusiness } = await import("../src/server/business-service");
  const { createSale, getSale, listSales } = await import("../src/server/sales-service");
  const { createPurchase, getPurchase } = await import("../src/server/purchase-service");
  const {
    deleteDocument,
    downloadDocument,
    listDocuments,
    uploadDocument,
  } = await import("../src/server/document-service");
  const { salesPdfDoc } = await import("../src/server/doc-mapper");
  const { renderSalesPdf } = await import("../src/lib/invoice-pdf");

  const actor = { id: 0, email: "smoke@example.invalid", role: "owner" as const };
  const stamp = String(Date.now());
  let summary: Record<string, unknown> = {};

  try {
    await db.transaction(async (tx) => {
      const handle = tx as unknown as typeof db;
      const business = await getBusiness(handle);

      const [smokeUser] = await handle
        .insert(users)
        .values({
          email: `smoke-${stamp}@example.invalid`,
          name: "Smoke Test",
          role: "owner",
          passwordHash: "not-a-real-hash",
        })
        .returning({ id: users.id });
      if (!smokeUser) {
        throw new Error("could not create the temporary user");
      }
      const actorWithId = { ...actor, id: smokeUser.id };
      const sale = await createSale(handle, actorWithId, {
        number: `SMK${stamp.slice(-10)}`,
        date: "2026-11-10",
        partyName: "Smoke Customer",
        partyGstin: "33AAPFU0939F1Z2",
        placeOfSupply: "33",
        lines: [
          {
            description: "Smoke line",
            hsnSac: "9963",
            qty: 2,
            unit: "NOS",
            unitPricePaise: 100000,
            gstRateBp: 500,
          },
        ],
      });

      const fetched = await getSale(handle, sale.id);
      if (!fetched) {
        throw new Error("sale was not readable after create");
      }

      const list = await listSales(handle, {
        from: "2026-11-10",
        to: "2026-11-10",
        q: "Smoke Customer",
      });
      if (list.total !== 1) {
        throw new Error(`sale list returned ${list.total} rows`);
      }

      const pdf = await renderSalesPdf(salesPdfDoc(fetched), {
        legalName: business.legalName,
        tradeName: business.tradeName,
        gstin: business.gstin,
        pan: business.pan,
        address: business.address,
        stateCode: business.stateCode,
        phone: business.phone,
        email: business.email,
        proprietor: business.proprietor,
      });
      if (pdf.length < 1000 || Buffer.from(pdf.slice(0, 5)).toString() !== "%PDF-") {
        throw new Error("invoice PDF looks wrong");
      }

      const attachment = await uploadDocument(handle, actorWithId, {
        entityType: "sale",
        entityId: sale.id,
        kind: "bill_photo",
        filename: "smoke.pdf",
        bytes: pdf,
      });
      const listed = await listDocuments(handle, "sale", sale.id);
      if (listed.length !== 1) {
        throw new Error(`attachment list returned ${listed.length} rows`);
      }
      const downloaded = await downloadDocument(handle, attachment.id);
      if (downloaded.body.byteLength !== pdf.byteLength) {
        throw new Error("downloaded attachment differs from the upload");
      }
      await deleteDocument(handle, actorWithId, attachment.id);

      const purchase = await createPurchase(handle, actorWithId, {
        number: `SMKB${stamp.slice(-9)}`,
        date: "2026-11-10",
        supplierName: "Smoke Supplier",
        supplierGstin: "33AAPFU0939F1Z2",
        placeOfSupply: "33",
        category: "inputs",
        itcPeriod: "2026-11",
        lines: [
          {
            description: "Smoke purchase",
            hsnSac: "9963",
            qty: 1,
            unit: "NOS",
            unitPricePaise: 50000,
            gstRateBp: 500,
          },
        ],
      });

      const fetchedPurchase = await getPurchase(handle, purchase.id);
      if (!fetchedPurchase) {
        throw new Error("purchase was not readable after create");
      }

      summary = {
        sale: fetched.number,
        saleTotalPaise: fetched.totalPaise,
        saleSection: fetched.section,
        listTotal: list.total,
        pdfBytes: pdf.length,
        attachment: attachment.filename,
        attachmentBytes: downloaded.body.byteLength,
        attachmentListed: listed.length,
        purchase: fetchedPurchase.number,
        purchaseTotalPaise: fetchedPurchase.totalPaise,
        itcPeriod: fetchedPurchase.itcPeriod,
        itcLines: fetchedPurchase.lines.length,
      };

      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) {
      await pgClient.end();
      throw error;
    }
  }

  await pgClient.end();
  console.log("Rolled back. Round trip succeeded:");
  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
