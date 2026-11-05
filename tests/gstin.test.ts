import { describe, expect, it } from "vitest";
import {
  gstinChecksum,
  normaliseGstin,
  stateFromGstin,
  stateName,
  validateGstin,
  validatePan,
} from "../src/lib/gst/gstin";

describe("GSTIN", () => {
  it("accepts a known valid GSTIN", () => {
    expect(validateGstin("27AAPFU0939F1ZV").ok).toBe(true);
    expect(stateFromGstin("33AAPFU0939F1Z2")).toBe("33");
  });

  it("rejects a bad checksum and a short value", () => {
    const badChecksum = validateGstin("27AAPFU0939F1ZA");
    expect(badChecksum.ok).toBe(false);
    expect(badChecksum.error.toLowerCase()).toContain("checksum");
    expect(validateGstin("27AAPFU0939F1Z").ok).toBe(false);
    expect(validateGstin("27AAPFU0939F1Z").error).toBe("GSTIN must be 15 characters");
  });

  it("rejects an unknown state code", () => {
    const result = validateGstin("99AAPFU0939F1ZV");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("state code");
  });

  it("computes the check character", () => {
    expect(gstinChecksum("27AAPFU0939F1Z")).toBe("V");
  });

  it("normalises case, spaces and blanks", () => {
    expect(normaliseGstin(" 27aapfu0939f1zv ")).toBe("27AAPFU0939F1ZV");
    expect(normaliseGstin(null)).toBe("");
  });

  it("returns null state for an unknown prefix", () => {
    expect(stateFromGstin("99AAPFU0939F1ZV")).toBeNull();
    expect(stateFromGstin("")).toBeNull();
  });
});

describe("PAN", () => {
  it("accepts the standard shape", () => {
    expect(validatePan("ABCDE1234F").ok).toBe(true);
    expect(validatePan(" abcde1234f ").ok).toBe(true);
  });

  it("rejects anything else", () => {
    expect(validatePan("ABCDE1234").ok).toBe(false);
    expect(validatePan("ABCD1234F").ok).toBe(false);
  });
});

describe("states", () => {
  it("maps codes to names", () => {
    expect(stateName("33")).toBe("Tamil Nadu");
    expect(stateName("96")).toBe("Foreign Country");
    expect(stateName("99")).toBeNull();
  });
});
