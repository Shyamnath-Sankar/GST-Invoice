import { describe, expect, it } from "vitest";
import { buildSalesDoc } from "../src/lib/docs";
import {
  renderCreditNotePdf,
  renderSalesPdf,
  type InvoiceBusiness,
} from "../src/lib/invoice-pdf";

const DOC_BUSINESS = {
  stateCode: "33",
  defaultPriceMode: "exclusive" as const,
  roundOff: true,
  b2clLimitPaise: 10_000_000,
  noItcScheme: false,
};

const PRINT_BUSINESS: InvoiceBusiness = {
  legalName: "Dev Caters",
  tradeName: "Dev Caters",
  gstin: "33AAPFU0939F1Z2",
  pan: "AAPFU0939F",
  address: "12 Bharathiar Street, Trichy 620001, Tamil Nadu",
  stateCode: "33",
  phone: "9876543210",
  email: "accounts@example.com",
  proprietor: "S Devanathan",
};

function invoice() {
  return buildSalesDoc(
    {
      number: "DC/26-27/001",
      date: "2026-10-15",
      partyName: "Registered buyer",
      partyGstin: "29AAPFU0939F1ZR",
      partyAddress: "5 MG Road, Bengaluru",
      placeOfSupply: "29",
      lines: [
        {
          description: "Outdoor catering, lunch",
          hsnSac: "9985",
          qty: 40,
          unit: "NOS",
          unitPricePaise: 25_000,
          gstRateBp: 500,
        },
        {
          description: "Dessert counter",
          hsnSac: "2105",
          qty: 1,
          unit: "NOS",
          unitPricePaise: 150_000,
          gstRateBp: 1800,
          cessRateBp: 1200,
        },
      ],
    },
    DOC_BUSINESS,
  );
}

function magic(bytes: Uint8Array): string {
  return Buffer.from(bytes.slice(0, 5)).toString("latin1");
}

describe("renderSalesPdf", () => {
  it("returns an A4 PDF beginning with the PDF magic bytes", async () => {
    const bytes = await renderSalesPdf(invoice(), PRINT_BUSINESS);

    expect(magic(bytes)).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("renders a credit note with the original invoice reference", async () => {
    const doc = buildSalesDoc(
      {
        docType: "credit_note",
        number: "CN/26-27/001",
        date: "2026-10-16",
        partyName: "Registered buyer",
        partyGstin: "29AAPFU0939F1ZR",
        placeOfSupply: "29",
        originalNumber: "DC/26-27/001",
        originalDate: "2026-10-15",
        noteReason: "Two plates returned",
        lines: [
          {
            description: "Outdoor catering, lunch",
            hsnSac: "9985",
            qty: 2,
            unit: "NOS",
            unitPricePaise: 25_000,
            gstRateBp: 500,
          },
        ],
      },
      DOC_BUSINESS,
    );

    const bytes = await renderCreditNotePdf(doc, PRINT_BUSINESS);

    expect(magic(bytes)).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(800);
  });
});
