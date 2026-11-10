/**
 * Invoice, credit-note and debit-note PDFs.
 *
 * PDFKit runs in Node only, so route handlers opt into the Node runtime. The
 * document is plain A4: business header, bill-to block, HSN lines, tax summary,
 * amount in words and a signature line. Amounts come from `BuiltSalesDoc`,
 * already rounded and stored as integer paise.
 */
import PDFDocument from "pdfkit";
import { formatINR, formatRateBp } from "./money";
import { stateName } from "./gst/gstin";
import type { BuiltLine, BuiltSalesDoc } from "./docs";
import { amountInWords } from "./words";

export interface InvoiceBusiness {
  legalName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  address: string;
  stateCode: string;
  phone: string;
  email: string;
  proprietor: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - 22;
const BODY = 8;
const GREY = "#555555";
const RULE = "#999999";
const HEADER_FILL = "#ededed";

type Align = "left" | "right" | "center";

interface Column {
  key: string;
  label: string;
  width: number;
  align: Align;
}

function money(paise: number): string {
  return formatINR(paise);
}

function quantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function documentTitle(doc: BuiltSalesDoc): string {
  if (doc.docType === "credit_note") {
    return "CREDIT NOTE";
  }
  if (doc.docType === "debit_note") {
    return "DEBIT NOTE";
  }
  return "TAX INVOICE";
}

function buildColumns(interState: boolean): Column[] {
  const fixed: Column[] = [
    { key: "num", label: "#", width: 18, align: "left" },
    { key: "hsn", label: "HSN/SAC", width: 40, align: "left" },
    { key: "qty", label: "Qty", width: 30, align: "right" },
    { key: "rate", label: "Rate", width: 50, align: "right" },
    { key: "taxable", label: "Taxable", width: 60, align: "right" },
    { key: "gst", label: "GST", width: 28, align: "right" },
    ...(interState
      ? ([{ key: "igst", label: "IGST", width: 76, align: "right" }] as Column[])
      : ([
          { key: "cgst", label: "CGST", width: 38, align: "right" },
          { key: "sgst", label: "SGST", width: 38, align: "right" },
        ] as Column[])),
    { key: "cess", label: "Cess", width: 30, align: "right" },
    { key: "total", label: "Total", width: 42, align: "right" },
  ];
  const used = fixed.reduce((sum, column) => sum + column.width, 0);
  return [
    { key: "description", label: "Description", width: CONTENT_WIDTH - used, align: "left" },
    ...fixed,
  ];
}

function lineValues(doc: BuiltSalesDoc, line: BuiltLine, interState: boolean): Record<string, string> {
  const values: Record<string, string> = {
    num: String(line.position + 1),
    description: line.description || "—",
    hsn: line.hsnSac || "—",
    qty: `${quantity(line.qty)} ${line.unit}`,
    rate: money(line.unitPricePaise),
    taxable: money(line.taxableValuePaise),
    gst: formatRateBp(line.gstRateBp),
    cess: line.cessPaise === 0 ? "—" : money(line.cessPaise),
    total: money(line.totalPaise),
  };
  if (interState) {
    values.igst = line.igstPaise === 0 ? "—" : money(line.igstPaise);
  } else {
    values.cgst = line.cgstPaise === 0 ? "—" : money(line.cgstPaise);
    values.sgst = line.sgstPaise === 0 ? "—" : money(line.sgstPaise);
  }
  return values;
}

function cellHeight(pdf: PDFKit.PDFDocument, text: string, width: number): number {
  pdf.font("Helvetica").fontSize(BODY);
  return pdf.heightOfString(text, { width: width - 6 });
}

function drawHeaderRow(
  pdf: PDFKit.PDFDocument,
  columns: Column[],
  y: number,
): number {
  const height = 18;
  pdf.rect(MARGIN, y, CONTENT_WIDTH, height).fill(HEADER_FILL);
  let x = MARGIN;
  for (const column of columns) {
    pdf
      .fillColor("#000000")
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(column.label, x + 3, y + 5, {
        width: column.width - 6,
        align: column.align,
        lineBreak: false,
      });
    x += column.width;
  }
  return y + height;
}

function drawRow(
  pdf: PDFKit.PDFDocument,
  columns: Column[],
  values: Record<string, string>,
  y: number,
): number {
  const height =
    Math.max(
      15,
      ...columns.map((column) =>
        cellHeight(pdf, values[column.key] ?? "", column.width),
      ),
    ) + 4;
  let x = MARGIN;
  for (const column of columns) {
    pdf
      .fillColor("#000000")
      .font("Helvetica")
      .fontSize(BODY)
      .text(values[column.key] ?? "", x + 3, y + 2, {
        width: column.width - 6,
        align: column.align,
      });
    x += column.width;
  }
  pdf
    .moveTo(MARGIN, y + height)
    .lineTo(MARGIN + CONTENT_WIDTH, y + height)
    .lineWidth(0.4)
    .strokeColor("#cccccc")
    .stroke();
  return y + height;
}

function drawTableHeading(
  pdf: PDFKit.PDFDocument,
  doc: BuiltSalesDoc,
  columns: Column[],
  y: number,
): number {
  let top = drawHeaderRow(pdf, columns, y);
  const interState = doc.igstPaise > 0;
  for (const line of doc.lines) {
    const values = lineValues(doc, line, interState);
    const needed =
      Math.max(
        15,
        ...columns.map((column) =>
          cellHeight(pdf, values[column.key] ?? "", column.width),
        ),
      ) + 4;
    if (top + needed > CONTENT_BOTTOM) {
      pdf.addPage();
      top = MARGIN;
      top = drawHeaderRow(pdf, columns, top);
    }
    top = drawRow(pdf, columns, values, top);
  }
  return top;
}

function drawTotals(
  pdf: PDFKit.PDFDocument,
  doc: BuiltSalesDoc,
  y: number,
): number {
  const labelX = MARGIN + CONTENT_WIDTH - 220;
  const valueX = MARGIN + CONTENT_WIDTH - 110;
  const rows: Array<[string, string]> = [["Taxable value", money(doc.taxableValuePaise)]];
  if (doc.cgstPaise > 0) {
    rows.push(["CGST", money(doc.cgstPaise)]);
  }
  if (doc.sgstPaise > 0) {
    rows.push(["SGST", money(doc.sgstPaise)]);
  }
  if (doc.igstPaise > 0) {
    rows.push(["IGST", money(doc.igstPaise)]);
  }
  if (doc.cessPaise > 0) {
    rows.push(["Cess", money(doc.cessPaise)]);
  }
  if (doc.roundOffPaise !== 0) {
    rows.push(["Round off", money(doc.roundOffPaise)]);
  }

  let top = y + 8;
  for (const [label, value] of rows) {
    pdf
      .fillColor("#000000")
      .font("Helvetica")
      .fontSize(9)
      .text(label, labelX, top, { width: 100, align: "left" });
    pdf.text(value, valueX, top, { width: 110, align: "right" });
    top += 13;
  }
  pdf
    .moveTo(labelX, top + 1)
    .lineTo(MARGIN + CONTENT_WIDTH, top + 1)
    .lineWidth(0.6)
    .strokeColor(RULE)
    .stroke();
  top += 5;
  pdf
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Invoice total", labelX, top, { width: 100, align: "left" });
  pdf.text(money(doc.totalPaise), valueX, top, { width: 110, align: "right" });
  return top + 18;
}

function drawWords(pdf: PDFKit.PDFDocument, doc: BuiltSalesDoc, y: number): number {
  pdf
    .fillColor(GREY)
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text("Amount in words", MARGIN, y, { width: CONTENT_WIDTH });
  pdf
    .fillColor("#000000")
    .font("Helvetica")
    .fontSize(9)
    .text(amountInWords(doc.totalPaise), MARGIN, y + 11, { width: CONTENT_WIDTH - 130 });
  return y + 34;
}

function drawSignature(pdf: PDFKit.PDFDocument, business: InvoiceBusiness, y: number): number {
  pdf
    .fillColor("#000000")
    .font("Helvetica")
    .fontSize(8)
    .text("Declaration: we certify that the particulars above are true and correct.", MARGIN, y, {
      width: CONTENT_WIDTH - 180,
    });
  const line = business.tradeName || business.legalName;
  pdf
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`For ${line}`, MARGIN + CONTENT_WIDTH - 170, y, {
      width: 170,
      align: "right",
    });
  pdf
    .font("Helvetica")
    .fontSize(8)
    .text("Authorised signatory", MARGIN + CONTENT_WIDTH - 170, y + 34, {
      width: 170,
      align: "right",
    });
  return y + 52;
}

function drawFooter(pdf: PDFKit.PDFDocument): void {
  const range = pdf.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    pdf.switchToPage(range.start + index);
    pdf
      .fillColor(GREY)
      .font("Helvetica")
      .fontSize(7)
      .text(
        "Computer-generated document. Check with your accountant before filing.",
        MARGIN,
        CONTENT_BOTTOM + 10,
        { width: CONTENT_WIDTH, align: "center" },
      );
  }
}

function drawDocument(
  pdf: PDFKit.PDFDocument,
  doc: BuiltSalesDoc,
  business: InvoiceBusiness,
): void {
  const displayName = business.tradeName || business.legalName;
  const interState = doc.igstPaise > 0;

  pdf
    .fillColor("#000000")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(displayName, MARGIN, MARGIN, { width: CONTENT_WIDTH - 180 });

  pdf
    .font("Helvetica")
    .fontSize(8)
    .text(business.address, MARGIN, MARGIN + 20, { width: CONTENT_WIDTH - 180 });
  const contact = [business.phone, business.email].filter(Boolean).join(" · ");
  pdf.text(contact, MARGIN, pdf.y, { width: CONTENT_WIDTH - 180 });
  pdf.text(
    `GSTIN: ${business.gstin || "—"}   State: ${stateName(business.stateCode) ?? business.stateCode}`,
    MARGIN,
    pdf.y,
    { width: CONTENT_WIDTH - 180 },
  );
  pdf.text(`PAN: ${business.pan || "—"}`, MARGIN, pdf.y, { width: CONTENT_WIDTH - 180 });

  pdf
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(documentTitle(doc), MARGIN + CONTENT_WIDTH - 180, MARGIN, {
      width: 180,
      align: "right",
    });
  pdf
    .font("Helvetica")
    .fontSize(9)
    .text(`No. ${doc.number}`, MARGIN + CONTENT_WIDTH - 180, MARGIN + 20, {
      width: 180,
      align: "right",
    });
  pdf.text(`Date: ${doc.date}`, MARGIN + CONTENT_WIDTH - 180, pdf.y, {
    width: 180,
    align: "right",
  });
  if (doc.docType !== "invoice") {
    pdf.text(`Against: ${doc.originalNumber}`, MARGIN + CONTENT_WIDTH - 180, pdf.y, {
      width: 180,
      align: "right",
    });
    if (doc.originalDate) {
      pdf.text(`Original date: ${doc.originalDate}`, MARGIN + CONTENT_WIDTH - 180, pdf.y, {
        width: 180,
        align: "right",
      });
    }
    if (doc.noteReason) {
      pdf.text(`Reason: ${doc.noteReason}`, MARGIN + CONTENT_WIDTH - 180, pdf.y, {
        width: 180,
        align: "right",
      });
    }
  }

  let y = Math.max(pdf.y, MARGIN + 62) + 12;
  pdf
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.8)
    .strokeColor(RULE)
    .stroke();
  y += 8;

  const partyWidth = CONTENT_WIDTH / 2 - 8;
  pdf.font("Helvetica-Bold").fontSize(8).text("Billed to", MARGIN, y, { width: partyWidth });
  pdf.font("Helvetica").fontSize(9).text(doc.partyName, MARGIN, y + 10, { width: partyWidth });
  if (doc.partyAddress) {
    pdf.font("Helvetica").fontSize(8).text(doc.partyAddress, MARGIN, pdf.y, {
      width: partyWidth,
    });
  }
  if (doc.partyGstin) {
    pdf.font("Helvetica").fontSize(8).text(`GSTIN: ${doc.partyGstin}`, MARGIN, pdf.y, {
      width: partyWidth,
    });
  }
  pdf
    .font("Helvetica")
    .fontSize(8)
    .text(`Place of supply: ${stateName(doc.placeOfSupply) ?? doc.placeOfSupply}`, MARGIN, pdf.y, {
      width: partyWidth,
    });

  const rightX = MARGIN + CONTENT_WIDTH / 2 + 8;
  const rightRows: Array<[string, string]> = [
    ["Place of supply", stateName(doc.placeOfSupply) ?? doc.placeOfSupply],
    ["Reverse charge", doc.reverseCharge ? "Yes" : "No"],
    ["Price mode", doc.priceMode === "inclusive" ? "Inclusive of GST" : "Exclusive of GST"],
  ];
  if (doc.orderRef) {
    rightRows.unshift(["Order reference", doc.orderRef]);
  }
  let rightY = y;
  for (const [label, value] of rightRows) {
    pdf.font("Helvetica").fontSize(8).text(`${label}: ${value}`, rightX, rightY, {
      width: partyWidth,
      align: "right",
    });
    rightY += 11;
  }

  y = Math.max(pdf.y, rightY) + 10;

  const columns = buildColumns(interState);
  y = drawTableHeading(pdf, doc, columns, y);
  y = drawTotals(pdf, doc, y);

  if (doc.lines.some((line) => line.supplyKind !== "taxable")) {
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor(GREY)
      .text(
        "Lines marked exempt, nil-rated or zero-rated carry no GST.",
        MARGIN,
        y,
        { width: CONTENT_WIDTH },
      );
    y = pdf.y + 6;
  }

  if (doc.notes) {
    pdf.font("Helvetica").fontSize(8).fillColor("#000000").text(`Notes: ${doc.notes}`, MARGIN, y, {
      width: CONTENT_WIDTH,
    });
    y = pdf.y + 6;
  }

  if (y > CONTENT_BOTTOM - 80) {
    pdf.addPage();
    y = MARGIN;
  }

  y = drawWords(pdf, doc, y);
  drawSignature(pdf, business, y);
  drawFooter(pdf);
}

function render(
  doc: BuiltSalesDoc,
  business: InvoiceBusiness,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN },
      bufferPages: true,
      info: {
        Title: `${documentTitle(doc)} ${doc.number}`,
        Author: business.legalName || business.tradeName,
        Subject: doc.partyName,
      },
    });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.on("error", reject);

    try {
      drawDocument(pdf, doc, business);
      pdf.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function renderSalesPdf(
  doc: BuiltSalesDoc,
  business: InvoiceBusiness,
): Promise<Uint8Array> {
  return render(doc, business);
}

export function renderCreditNotePdf(
  doc: BuiltSalesDoc,
  business: InvoiceBusiness,
): Promise<Uint8Array> {
  if (doc.docType !== "credit_note") {
    throw new Error("This PDF renderer is for credit notes");
  }
  return render(doc, business);
}
