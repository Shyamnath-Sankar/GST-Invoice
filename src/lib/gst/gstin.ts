/** GSTIN / PAN validation and Indian state codes. */

export const STATES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "96": "Foreign Country",
  "97": "Other Territory",
};

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export interface Check {
  ok: boolean;
  error: string;
}

function check(ok: boolean, error = ""): Check {
  return { ok, error };
}

/** The 15th character of a GSTIN. */
export function gstinChecksum(first14: string): string {
  const value = first14.toUpperCase();
  let total = 0;
  for (let i = 0; i < value.length; i += 1) {
    const character = value.charAt(i);
    const index = CHARS.indexOf(character);
    if (index < 0) {
      throw new Error(`Invalid GSTIN character: ${character}`);
    }
    const product = index * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return CHARS.charAt((36 - (total % 36)) % 36);
}

export function normaliseGstin(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/ /g, "");
}

export function validateGstin(value: string | null | undefined): Check {
  const gstin = normaliseGstin(value);
  if (gstin.length !== 15) {
    return check(false, "GSTIN must be 15 characters");
  }
  if (!GSTIN_RE.test(gstin)) {
    return check(
      false,
      "GSTIN format is not valid (2-digit state, PAN, entity number, Z, check digit)",
    );
  }
  if (!(gstin.slice(0, 2) in STATES)) {
    return check(false, `Unknown state code ${gstin.slice(0, 2)}`);
  }
  if (!PAN_RE.test(gstin.slice(2, 12))) {
    return check(false, "Characters 3 to 12 of the GSTIN must be a valid PAN");
  }
  if (gstinChecksum(gstin.slice(0, 14)) !== gstin.charAt(14)) {
    return check(false, "GSTIN checksum does not match. Check for a typing mistake");
  }
  return check(true);
}

export function isValidGstin(value: string | null | undefined): boolean {
  return validateGstin(value).ok;
}

export function validatePan(value: string | null | undefined): Check {
  const pan = (value ?? "").trim().toUpperCase();
  return PAN_RE.test(pan)
    ? check(true)
    : check(false, "PAN must look like ABCDE1234F");
}

export function stateFromGstin(value: string | null | undefined): string | null {
  const gstin = normaliseGstin(value);
  const code = gstin.slice(0, 2);
  return gstin.length >= 2 && code in STATES ? code : null;
}

export function stateName(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return STATES[code] ?? null;
}
