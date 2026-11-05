import { describe, expect, it } from "vitest";
import { objectKey } from "../src/lib/storage";

describe("objectKey", () => {
  it("builds entity/id/uuid.ext keys", () => {
    expect(objectKey("sale", 12, "JPG")).toMatch(
      /^sale\/12\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
    expect(objectKey("purchase", 1, "pdf")).toMatch(/^purchase\/1\/.+\.pdf$/);
  });

  it("does not repeat a key", () => {
    expect(objectKey("sale", 1, "png")).not.toBe(objectKey("sale", 1, "png"));
  });

  it("rejects values that could escape the prefix", () => {
    expect(() => objectKey("../sale", 1, "jpg")).not.toThrow();
    expect(objectKey("../sale", 1, "jpg").startsWith("sale/")).toBe(true);
    expect(() => objectKey("", 1, "jpg")).toThrow();
    expect(() => objectKey("sale", 0, "jpg")).toThrow();
    expect(() => objectKey("sale", 1.5, "jpg")).toThrow();
    expect(() => objectKey("sale", 1, "")).toThrow();
  });
});
