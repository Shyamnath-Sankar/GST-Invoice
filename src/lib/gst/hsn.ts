/**
 * HSN / SAC helpers shared by the settings screens and the masters service.
 * Codes are 4, 6 or 8 digits; the unit list is the GST portal's UQC list.
 */

export const UQC = [
  "NOS",
  "KGS",
  "LTR",
  "MTR",
  "PCS",
  "BOX",
  "BAG",
  "PAC",
  "SET",
  "PLT",
  "OTH",
  "NA",
] as const;

export type Uqc = (typeof UQC)[number];

export function isValidHsnCode(code: string): boolean {
  return /^(\d{4}|\d{6}|\d{8})$/.test(code.trim());
}

export function isValidUqc(unit: string): boolean {
  return (UQC as readonly string[]).includes(unit);
}
