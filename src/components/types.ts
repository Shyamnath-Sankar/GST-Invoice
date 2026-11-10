/** Shapes returned by the masters API. Kept plain so they can cross the server boundary. */

export interface Me {
  id: number;
  email: string;
  name: string;
  role: "owner" | "accountant";
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface Business {
  id: number;
  legalName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  address: string;
  stateCode: string;
  jurisdiction: string;
  registrationType: "regular" | "composition";
  filingFrequency: "monthly" | "quarterly";
  fyStartYear: number;
  phone: string;
  email: string;
  proprietor: string;
  invoicePrefix: string;
  b2clLimitPaise: number;
  noItcScheme: boolean;
  roundOff: boolean;
  defaultPriceMode: "exclusive" | "inclusive";
}

export interface TaxRate {
  id: number;
  rateBp: number;
  label: string;
  active: boolean;
}

export interface Hsn {
  id: number;
  code: string;
  description: string;
  isService: boolean;
  defaultRateBp: number;
  supplyKind: string;
  uqc: string;
  itcAllowed: boolean;
  notes: string;
  active: boolean;
}

export interface Party {
  id: number;
  kind: "customer" | "supplier";
  name: string;
  gstin: string;
  address: string;
  stateCode: string;
  phone: string;
  email: string;
  active: boolean;
}

export interface Meta {
  states: Array<{ code: string; name: string }>;
  uqc: string[];
  supplyKinds: string[];
  rates: TaxRate[];
  currentFy: string;
  currentPeriod: string;
  periods: Array<{ key: string; label: string }>;
  previousPeriods: Array<{ key: string; label: string }>;
}

/** Lines as the sales and purchase API returns them (quantity is numeric text). */
export interface DocumentLine {
  id: number;
  docId: number;
  position: number;
  description: string;
  hsnSac: string;
  qty: string;
  unit: string;
  unitPricePaise: number;
  discountPaise: number;
  gstRateBp: number;
  cessRateBp: number;
  supplyKind: string;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
  itcEligible?: boolean;
  itcReason?: string;
}

export interface SaleRecord {
  id: number;
  docType: "invoice" | "credit_note" | "debit_note";
  number: string;
  date: string;
  partyName: string;
  partyGstin: string;
  partyAddress: string;
  partyStateCode: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  priceMode: "exclusive" | "inclusive";
  isExport: boolean;
  exportWithIgst: boolean;
  section: string;
  status: "active" | "cancelled" | "amended";
  notes: string;
  orderRef: string;
  originalNumber: string;
  originalDate: string | null;
  noteReason: string;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  amendsId: number | null;
  amendedById: number | null;
  amendPeriod: string;
  attachments?: number;
}

export interface SaleDetail extends SaleRecord {
  lines: DocumentLine[];
}

export interface PurchaseRecord {
  id: number;
  docType: "invoice" | "credit_note" | "debit_note";
  number: string;
  date: string;
  supplierName: string;
  supplierGstin: string;
  supplierStateCode: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  priceMode: "exclusive" | "inclusive";
  category: string;
  itcPeriod: string;
  status: "active" | "cancelled";
  notes: string;
  originalNumber: string;
  originalDate: string | null;
  noteReason: string;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  attachments?: number;
  itcEligiblePaise?: number;
}

export interface PurchaseDetail extends PurchaseRecord {
  lines: DocumentLine[];
}

export interface SalesListResult {
  rows: SaleRecord[];
  total: number;
  page: number;
  size: number;
  sums: { taxableValuePaise: number; taxPaise: number; totalPaise: number };
}

export interface PurchaseListResult {
  rows: PurchaseRecord[];
  total: number;
  page: number;
  size: number;
  sums: { taxableValuePaise: number; taxPaise: number; totalPaise: number };
}

export interface Attachment {
  id: number;
  entityType: "sale" | "purchase" | "return" | "party";
  entityId: number;
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  createdAt: string;
}

export interface CalcLine {
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  taxableValuePaise: number;
  totalPaise: number;
}

export interface Calculation {
  lines: CalcLine[];
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  section: string | null;
}

/** Editable document state shared by the sales and purchase editors. */
export interface EditorLine {
  description: string;
  hsnSac: string;
  qty: string;
  unit: string;
  unitPrice: string;
  discount: string;
  gstRateBp: number;
  cessRateBp: number;
  supplyKind: string;
  itcEligible: boolean;
  itcReason: string;
}

export interface EditorValue {
  docType: "invoice" | "credit_note" | "debit_note";
  number: string;
  date: string;
  partyName: string;
  partyGstin: string;
  partyAddress: string;
  partyStateCode: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  priceMode: "exclusive" | "inclusive";
  notes: string;
  orderRef: string;
  isExport: boolean;
  exportWithIgst: boolean;
  originalNumber: string;
  originalDate: string;
  noteReason: string;
  category: string;
  itcPeriod: string;
  lines: EditorLine[];
}

export interface EditorBusiness {
  stateCode: string;
  defaultPriceMode: "exclusive" | "inclusive";
  roundOff: boolean;
  b2clLimitPaise: number;
  noItcScheme: boolean;
}
