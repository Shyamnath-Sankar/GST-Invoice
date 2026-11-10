/** Serialise persisted rows into the plain state the document editor edits. */
import type {
  EditorBusiness,
  EditorLine,
  EditorValue,
} from "@/components/types";
import { formatINR } from "@/lib/money";
import { monthKey } from "@/lib/gst/periods";
import type { BusinessRow } from "./doc-common";
import type { SalesWithLines } from "./sales-service";
import type { PurchaseWithLines } from "./purchase-service";

export function editorBusiness(row: BusinessRow): EditorBusiness {
  return {
    stateCode: row.stateCode,
    defaultPriceMode: row.defaultPriceMode,
    roundOff: row.roundOff,
    b2clLimitPaise: row.b2clLimitPaise,
    noItcScheme: row.noItcScheme,
  };
}

export function blankLine(rateBp = 500): EditorLine {
  return {
    description: "",
    hsnSac: "",
    qty: "1",
    unit: "NOS",
    unitPrice: "",
    discount: "0",
    gstRateBp: rateBp,
    cessRateBp: 0,
    supplyKind: "taxable",
    itcEligible: true,
    itcReason: "",
  };
}

function saleLines(row: SalesWithLines): EditorLine[] {
  return row.lines.map((line) => ({
    description: line.description,
    hsnSac: line.hsnSac,
    qty: String(Number(line.qty)),
    unit: line.unit,
    unitPrice: formatINR(line.unitPricePaise),
    discount: formatINR(line.discountPaise),
    gstRateBp: line.gstRateBp,
    cessRateBp: line.cessRateBp,
    supplyKind: line.supplyKind,
    itcEligible: true,
    itcReason: "",
  }));
}

function purchaseLines(row: PurchaseWithLines): EditorLine[] {
  return row.lines.map((line) => ({
    description: line.description,
    hsnSac: line.hsnSac,
    qty: String(Number(line.qty)),
    unit: line.unit,
    unitPrice: formatINR(line.unitPricePaise),
    discount: formatINR(line.discountPaise),
    gstRateBp: line.gstRateBp,
    cessRateBp: line.cessRateBp,
    supplyKind: line.supplyKind,
    itcEligible: line.itcEligible,
    itcReason: line.itcReason,
  }));
}

export function newSalesEditor(
  business: BusinessRow,
  number: string,
  date: string,
): EditorValue {
  return {
    docType: "invoice",
    number,
    date,
    partyName: "",
    partyGstin: "",
    partyAddress: "",
    partyStateCode: "",
    placeOfSupply: business.stateCode,
    reverseCharge: false,
    priceMode: business.defaultPriceMode,
    notes: "",
    orderRef: "",
    isExport: false,
    exportWithIgst: false,
    originalNumber: "",
    originalDate: "",
    noteReason: "",
    category: "inputs",
    itcPeriod: monthKey(date),
    lines: [blankLine()],
  };
}

export function saleEditor(row: SalesWithLines): EditorValue {
  return {
    docType: row.docType,
    number: row.number,
    date: row.date,
    partyName: row.partyName,
    partyGstin: row.partyGstin,
    partyAddress: row.partyAddress,
    partyStateCode: row.partyStateCode,
    placeOfSupply: row.placeOfSupply,
    reverseCharge: row.reverseCharge,
    priceMode: row.priceMode,
    notes: row.notes,
    orderRef: row.orderRef,
    isExport: row.isExport,
    exportWithIgst: row.exportWithIgst,
    originalNumber: row.originalNumber,
    originalDate: row.originalDate ?? "",
    noteReason: row.noteReason,
    category: "inputs",
    itcPeriod: monthKey(row.date),
    lines: saleLines(row),
  };
}

export function amendSaleEditor(row: SalesWithLines, date: string): EditorValue {
  const base = saleEditor(row);
  return {
    ...base,
    number: "",
    date,
    originalNumber: row.number,
    originalDate: row.date,
    noteReason: base.noteReason || "Amendment",
    docType: "invoice",
  };
}

export function newPurchaseEditor(
  business: BusinessRow,
  date: string,
): EditorValue {
  return {
    docType: "invoice",
    number: "",
    date,
    partyName: "",
    partyGstin: "",
    partyAddress: "",
    partyStateCode: "",
    placeOfSupply: business.stateCode,
    reverseCharge: false,
    priceMode: "exclusive",
    notes: "",
    orderRef: "",
    isExport: false,
    exportWithIgst: false,
    originalNumber: "",
    originalDate: "",
    noteReason: "",
    category: "inputs",
    itcPeriod: monthKey(date),
    lines: [blankLine()],
  };
}

export function purchaseEditor(row: PurchaseWithLines): EditorValue {
  return {
    docType: row.docType,
    number: row.number,
    date: row.date,
    partyName: row.supplierName,
    partyGstin: row.supplierGstin,
    partyAddress: "",
    partyStateCode: row.supplierStateCode,
    placeOfSupply: row.placeOfSupply,
    reverseCharge: row.reverseCharge,
    priceMode: row.priceMode,
    notes: row.notes,
    orderRef: "",
    isExport: false,
    exportWithIgst: false,
    originalNumber: row.originalNumber,
    originalDate: row.originalDate ?? "",
    noteReason: row.noteReason,
    category: row.category,
    itcPeriod: row.itcPeriod,
    lines: purchaseLines(row),
  };
}
