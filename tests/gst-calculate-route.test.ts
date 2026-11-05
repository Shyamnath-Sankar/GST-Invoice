import { describe, expect, it } from "vitest";
import { POST } from "../src/app/api/gst/calculate/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/gst/calculate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/gst/calculate", () => {
  it("returns document totals and the GSTR-1 section", async () => {
    const response = await POST(
      post({
        lines: [{ qty: 100, unitPricePaise: 25000, gstRateBp: 500 }],
        interState: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.taxableValuePaise).toBe(2500000);
    expect(body.cgstPaise).toBe(62500);
    expect(body.sgstPaise).toBe(62500);
    expect(body.totalPaise).toBe(2625000);
    expect(body.section).toBe("b2cs");
    expect(body.byKind).toEqual({ taxable: 2500000 });
  });

  it("classifies an export and zero-rates it", async () => {
    const response = await POST(
      post({
        lines: [{ qty: 1, unitPricePaise: 100000, gstRateBp: 1800 }],
        interState: true,
        isExport: true,
        partyGstin: "33AAPFU0939F1Z2",
      }),
    );

    const body = await response.json();
    expect(body.section).toBe("exp");
    expect(body.byKind).toEqual({ zero_rated: 100000 });
    expect(body.igstPaise).toBe(0);
    expect(body.totalPaise).toBe(100000);
  });

  it("has no GSTR-1 section for a purchase", async () => {
    const response = await POST(
      post({
        kind: "purchase",
        lines: [{ qty: 1, unitPricePaise: 10000, gstRateBp: 500 }],
      }),
    );

    const body = await response.json();
    expect(body.section).toBeNull();
  });

  it("rejects invalid input with 422", async () => {
    const badQuantity = await POST(
      post({ lines: [{ qty: 0, unitPricePaise: 10000, gstRateBp: 500 }] }),
    );
    expect(badQuantity.status).toBe(422);
    const body = await badQuantity.json();
    expect(body.error).toContain("qty");

    const badKind = await POST(
      post({
        lines: [{ qty: 1, unitPricePaise: 10000, gstRateBp: 500, supplyKind: "gift" }],
      }),
    );
    expect(badKind.status).toBe(422);

    const badJson = await POST(
      new Request("http://localhost/api/gst/calculate", {
        method: "POST",
        body: "{",
      }),
    );
    expect(badJson.status).toBe(400);
  });
});
