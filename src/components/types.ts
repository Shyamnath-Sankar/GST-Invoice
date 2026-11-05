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
