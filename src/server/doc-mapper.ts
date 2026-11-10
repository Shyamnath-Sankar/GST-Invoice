/** Map a persisted sales row back into the shape the PDF renderer needs. */
import type { BuiltLine, BuiltSalesDoc } from "@/lib/docs";
import type { SalesWithLines } from "./sales-service";

function builtLine(line: SalesWithLines["lines"][number]): BuiltLine {
  return {
    position: line.position,
    description: line.description,
    hsnSac: line.hsnSac,
    qty: Number(line.qty),
    unit: line.unit,
    unitPricePaise: line.unitPricePaise,
    discountPaise: line.discountPaise,
    gstRateBp: line.gstRateBp,
    cessRateBp: line.cessRateBp,
    supplyKind: line.supplyKind,
    taxableValuePaise: line.taxableValuePaise,
    cgstPaise: line.cgstPaise,
    sgstPaise: line.sgstPaise,
    igstPaise: line.igstPaise,
    cessPaise: line.cessPaise,
    totalPaise: line.totalPaise,
  };
}

export function salesPdfDoc(row: SalesWithLines): BuiltSalesDoc {
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
    isExport: row.isExport,
    exportWithIgst: row.exportWithIgst,
    section: row.section as BuiltSalesDoc["section"],
    notes: row.notes,
    orderRef: row.orderRef,
    originalNumber: row.originalNumber,
    originalDate: row.originalDate,
    noteReason: row.noteReason,
    lines: row.lines.map(builtLine),
    taxableValuePaise: row.taxableValuePaise,
    cgstPaise: row.cgstPaise,
    sgstPaise: row.sgstPaise,
    igstPaise: row.igstPaise,
    cessPaise: row.cessPaise,
    roundOffPaise: row.roundOffPaise,
    totalPaise: row.totalPaise,
  };
}
