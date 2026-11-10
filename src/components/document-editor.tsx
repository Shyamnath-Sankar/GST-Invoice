"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/components/api";
import { formatINR, percentToBp, toPaise } from "@/lib/money";
import { UQC } from "@/lib/gst/hsn";
import { STATES } from "@/lib/gst/gstin";
import type {
  Calculation,
  EditorBusiness,
  EditorLine,
  EditorValue,
  Hsn,
  Meta,
  TaxRate,
} from "@/components/types";

export type EditorKind = "sales" | "purchase";
export type EditorMode = "new" | "edit" | "amend";

export type { EditorBusiness, EditorLine, EditorValue } from "@/components/types";

interface Props {
  kind: EditorKind;
  mode: EditorMode;
  id?: number;
  initial: EditorValue;
  business: EditorBusiness;
}

const FALLBACK_RATES: TaxRate[] = [0, 500, 1200, 1800, 2800].map((rateBp, index) => ({
  id: -(index + 1),
  rateBp,
  label: `${rateBp / 100}%`,
  active: true,
}));

const SUPPLY_KIND_LABELS: Record<string, string> = {
  taxable: "Taxable",
  exempt: "Exempt",
  nil: "Nil rated",
  non_gst: "Non-GST",
  zero_rated: "Zero rated",
};

export function emptyLine(rateBp = 500): EditorLine {
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

function paiseFromText(value: string): number {
  try {
    return toPaise(value);
  } catch {
    return Number.NaN;
  }
}

export function DocumentEditor({ kind, mode, id, initial, business }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<EditorValue>(initial);
  const [rates, setRates] = useState<TaxRate[]>(FALLBACK_RATES);
  const [hsnCodes, setHsnCodes] = useState<Hsn[]>([]);
  const [totals, setTotals] = useState<Calculation | null>(null);
  const [calcError, setCalcError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Meta>("/api/meta")
      .then((meta) => {
        if (meta.rates.length > 0) {
          setRates(meta.rates.filter((rate) => rate.active));
        }
      })
      .catch(() => undefined);
    api<Hsn[]>("/api/hsn")
      .then(setHsnCodes)
      .catch(() => undefined);
  }, []);

  const interState =
    kind === "sales"
      ? value.isExport || value.placeOfSupply !== business.stateCode
      : (value.partyStateCode || business.stateCode) !== business.stateCode;

  useEffect(() => {
    const usable = value.lines.filter((line) => {
      const qty = Number(line.qty);
      return Number.isFinite(qty) && qty > 0 && Number.isFinite(paiseFromText(line.unitPrice));
    });
    if (usable.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      const body = {
        kind,
        docType: value.docType,
        partyGstin: value.partyGstin,
        isExport: kind === "sales" ? value.isExport : false,
        exportWithIgst: kind === "sales" ? value.exportWithIgst : false,
        b2clLimitPaise: business.b2clLimitPaise,
        inclusive: value.priceMode === "inclusive",
        interState,
        roundOff: business.roundOff,
        lines: usable.map((line) => ({
          description: line.description,
          hsnSac: line.hsnSac,
          qty: Number(line.qty),
          unit: line.unit,
          unitPricePaise: paiseFromText(line.unitPrice),
          discountPaise: paiseFromText(line.discount) || 0,
          gstRateBp: line.gstRateBp,
          cessRateBp: line.cessRateBp,
          supplyKind: line.supplyKind,
        })),
      };
      api<Calculation>("/api/gst/calculate", { body })
        .then((result) => {
          setTotals(result);
          setCalcError("");
        })
        .catch((problem) => {
          setTotals(null);
          setCalcError(errorMessage(problem));
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [kind, value, business, interState]);

  function set<K extends keyof EditorValue>(key: K, next: EditorValue[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  function setLine(index: number, patch: Partial<EditorLine>) {
    setValue((current) => ({
      ...current,
      lines: current.lines.map((line, position) =>
        position === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function addLine() {
    setValue((current) => ({ ...current, lines: [...current.lines, emptyLine()] }));
  }

  function removeLine(index: number) {
    setValue((current) => ({
      ...current,
      lines:
        current.lines.length === 1
          ? [emptyLine()]
          : current.lines.filter((_, position) => position !== index),
    }));
  }

  function applyHsn(index: number, code: string) {
    const match = hsnCodes.find((row) => row.code === code.trim());
    if (match) {
      setLine(index, {
        hsnSac: code,
        gstRateBp: match.defaultRateBp,
        unit: match.uqc || "NOS",
        description: value.lines[index]?.description || match.description,
      });
    } else {
      setLine(index, { hsnSac: code });
    }
  }

  function requestBody(): Record<string, unknown> {
    const lines = value.lines.map((line) => ({
      description: line.description,
      hsnSac: line.hsnSac,
      qty: Number(line.qty),
      unit: line.unit,
      unitPricePaise: paiseFromText(line.unitPrice),
      discountPaise: paiseFromText(line.discount) || 0,
      gstRateBp: line.gstRateBp,
      cessRateBp: line.cessRateBp,
      supplyKind: line.supplyKind,
      ...(kind === "purchase"
        ? { itcEligible: line.itcEligible, itcReason: line.itcReason }
        : {}),
    }));

    const common = {
      docType: value.docType,
      number: value.number,
      date: value.date,
      placeOfSupply: value.placeOfSupply,
      reverseCharge: value.reverseCharge,
      priceMode: value.priceMode,
      roundOff: business.roundOff,
      notes: value.notes,
      originalNumber: value.originalNumber,
      originalDate: value.originalDate || null,
      noteReason: value.noteReason,
      lines,
    };

    if (kind === "sales") {
      return {
        ...common,
        partyName: value.partyName,
        partyGstin: value.partyGstin,
        partyAddress: value.partyAddress,
        partyStateCode: value.partyStateCode,
        orderRef: value.orderRef,
        isExport: value.isExport,
        exportWithIgst: value.exportWithIgst,
      };
    }
    return {
      ...common,
      supplierName: value.partyName,
      supplierGstin: value.partyGstin,
      supplierStateCode: value.partyStateCode,
      category: value.category,
      itcPeriod: value.itcPeriod,
    };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!value.number.trim()) {
      setError(kind === "sales" ? "Invoice number is required" : "Supplier bill number is required");
      return;
    }
    if (!value.partyName.trim()) {
      setError(kind === "sales" ? "Customer name is required" : "Supplier name is required");
      return;
    }
    setBusy(true);
    try {
      const body = requestBody();
      let saved: { id: number };
      if (kind === "sales") {
        if (mode === "amend" && id) {
          saved = await api<{ id: number }>(`/api/sales/${id}/amend`, { body });
        } else if (mode === "edit" && id) {
          saved = await api<{ id: number }>(`/api/sales/${id}`, { method: "PUT", body });
        } else {
          saved = await api<{ id: number }>("/api/sales", { body });
        }
        router.push(`/sales/${saved.id}`);
      } else {
        if (mode === "edit" && id) {
          saved = await api<{ id: number }>(`/api/purchases/${id}`, { method: "PUT", body });
        } else {
          saved = await api<{ id: number }>("/api/purchases", { body });
        }
        router.push(`/purchases/${saved.id}`);
      }
      router.refresh();
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  const listHref = kind === "sales" ? "/sales" : "/purchases";
  const note = value.docType !== "invoice";
  const canPreview = value.lines.some((line) => {
    const qty = Number(line.qty);
    return Number.isFinite(qty) && qty > 0 && Number.isFinite(paiseFromText(line.unitPrice));
  });

  return (
    <form onSubmit={save}>
      <p>
        <Link href={listHref}>← Back to {kind === "sales" ? "sales" : "purchases"}</Link>
      </p>

      {mode === "amend" ? (
        <p className="muted">
          Amending an invoice already reported in a filed period. The correction is written to the
          current open period and the original stays in place.
        </p>
      ) : null}

      <section className="sheet">
        <div className="sheet-pad">
          <h2>Document</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="doc-type">Type</label>
              <select
                id="doc-type"
                value={value.docType}
                onChange={(event) => set("docType", event.target.value as EditorValue["docType"])}
              >
                <option value="invoice">Invoice</option>
                <option value="credit_note">Credit note</option>
                <option value="debit_note">Debit note</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="doc-number">{kind === "sales" ? "Invoice number" : "Supplier bill number"}</label>
              <input
                id="doc-number"
                required
                value={value.number}
                onChange={(event) => set("number", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="doc-date">Date</label>
              <input
                id="doc-date"
                type="date"
                required
                value={value.date}
                onChange={(event) => set("date", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="doc-price-mode">Prices</label>
              <select
                id="doc-price-mode"
                value={value.priceMode}
                onChange={(event) =>
                  set("priceMode", event.target.value as EditorValue["priceMode"])
                }
              >
                <option value="exclusive">GST added</option>
                <option value="inclusive">GST included</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="doc-party">{kind === "sales" ? "Customer" : "Supplier"}</label>
              <input
                id="doc-party"
                required
                value={value.partyName}
                onChange={(event) => set("partyName", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="doc-gstin">GSTIN</label>
              <input
                id="doc-gstin"
                maxLength={15}
                spellCheck={false}
                value={value.partyGstin}
                onChange={(event) => set("partyGstin", event.target.value.toUpperCase())}
              />
            </div>
            <div className="field">
              <label htmlFor="doc-state">{kind === "sales" ? "Customer state" : "Supplier state"}</label>
              <select
                id="doc-state"
                value={value.partyStateCode}
                onChange={(event) => set("partyStateCode", event.target.value)}
              >
                <option value="">Use the business state</option>
                {Object.entries(STATES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="doc-pos">Place of supply</label>
              <select
                id="doc-pos"
                value={value.placeOfSupply}
                onChange={(event) => set("placeOfSupply", event.target.value)}
              >
                {Object.entries(STATES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field span-2">
              <label htmlFor="doc-address">Address</label>
              <textarea
                id="doc-address"
                rows={2}
                value={value.partyAddress}
                onChange={(event) => set("partyAddress", event.target.value)}
              />
            </div>

            {kind === "sales" ? (
              <>
                <div className="field">
                  <label htmlFor="doc-order">Order reference</label>
                  <input
                    id="doc-order"
                    value={value.orderRef}
                    onChange={(event) => set("orderRef", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={value.isExport}
                      onChange={(event) =>
                        setValue((current) => ({
                          ...current,
                          isExport: event.target.checked,
                          placeOfSupply: event.target.checked ? "96" : current.placeOfSupply,
                        }))
                      }
                    />
                    <span>Export (zero rated, place of supply 96)</span>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={value.reverseCharge}
                      onChange={(event) => set("reverseCharge", event.target.checked)}
                    />
                    <span>Reverse charge</span>
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="doc-category">Category</label>
                  <select
                    id="doc-category"
                    value={value.category}
                    onChange={(event) => set("category", event.target.value)}
                  >
                    <option value="inputs">Inputs / goods</option>
                    <option value="input_services">Input services</option>
                    <option value="capital_goods">Capital goods</option>
                    <option value="expense">Expense (ITC blocked)</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="doc-itc-period">ITC period</label>
                  <input
                    id="doc-itc-period"
                    placeholder="2026-10"
                    value={value.itcPeriod}
                    onChange={(event) => set("itcPeriod", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={value.reverseCharge}
                      onChange={(event) => set("reverseCharge", event.target.checked)}
                    />
                    <span>Reverse charge</span>
                  </label>
                </div>
              </>
            )}

            {note ? (
              <>
                <div className="field">
                  <label htmlFor="doc-original">Original invoice number</label>
                  <input
                    id="doc-original"
                    required
                    value={value.originalNumber}
                    onChange={(event) => set("originalNumber", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="doc-original-date">Original invoice date</label>
                  <input
                    id="doc-original-date"
                    type="date"
                    value={value.originalDate}
                    onChange={(event) => set("originalDate", event.target.value)}
                  />
                </div>
                <div className="field span-2">
                  <label htmlFor="doc-reason">Reason for the note</label>
                  <input
                    id="doc-reason"
                    value={value.noteReason}
                    onChange={(event) => set("noteReason", event.target.value)}
                  />
                </div>
              </>
            ) : null}

            <div className="field span-2">
              <label htmlFor="doc-notes">Notes</label>
              <textarea
                id="doc-notes"
                rows={2}
                value={value.notes}
                onChange={(event) => set("notes", event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="sheet">
        <div className="sheet-pad">
          <h2>Lines</h2>
          <datalist id="hsn-codes">
            {hsnCodes.map((row) => (
              <option key={row.id} value={row.code}>
                {row.description}
              </option>
            ))}
          </datalist>
          <table className="editor-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th>HSN/SAC</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Rate</th>
                <th>Discount</th>
                <th>GST</th>
                <th>Cess %</th>
                <th>Supply</th>
                {kind === "purchase" ? <th>ITC</th> : null}
                <th />
              </tr>
            </thead>
            <tbody>
              {value.lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <input
                      aria-label={`Description line ${index + 1}`}
                      value={line.description}
                      onChange={(event) => setLine(index, { description: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`HSN line ${index + 1}`}
                      list="hsn-codes"
                      value={line.hsnSac}
                      onChange={(event) => applyHsn(index, event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Quantity line ${index + 1}`}
                      inputMode="decimal"
                      className="num"
                      value={line.qty}
                      onChange={(event) => setLine(index, { qty: event.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Unit line ${index + 1}`}
                      value={line.unit}
                      onChange={(event) => setLine(index, { unit: event.target.value })}
                    >
                      {!UQC.includes(line.unit as (typeof UQC)[number]) ? (
                        <option value={line.unit}>{line.unit}</option>
                      ) : null}
                      {UQC.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`Rate line ${index + 1}`}
                      inputMode="decimal"
                      className="num"
                      value={line.unitPrice}
                      onChange={(event) => setLine(index, { unitPrice: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Discount line ${index + 1}`}
                      inputMode="decimal"
                      className="num"
                      value={line.discount}
                      onChange={(event) => setLine(index, { discount: event.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`GST rate line ${index + 1}`}
                      value={line.gstRateBp}
                      onChange={(event) =>
                        setLine(index, { gstRateBp: Number(event.target.value) })
                      }
                    >
                      {rates.map((rate) => (
                        <option key={rate.id} value={rate.rateBp}>
                          {rate.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`Cess rate line ${index + 1}`}
                      inputMode="decimal"
                      className="num"
                      value={line.cessRateBp / 100}
                      onChange={(event) =>
                        setLine(index, { cessRateBp: percentToBp(Number(event.target.value) || 0) })
                      }
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Supply kind line ${index + 1}`}
                      value={line.supplyKind}
                      onChange={(event) => setLine(index, { supplyKind: event.target.value })}
                    >
                      {Object.entries(SUPPLY_KIND_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  {kind === "purchase" ? (
                    <td>
                      <label className="check">
                        <input
                          aria-label={`ITC eligible line ${index + 1}`}
                          type="checkbox"
                          checked={line.itcEligible}
                          onChange={(event) =>
                            setLine(index, { itcEligible: event.target.checked })
                          }
                        />
                        <span>{line.itcEligible ? "Eligible" : "Blocked"}</span>
                      </label>
                    </td>
                  ) : null}
                  <td>
                    <button type="button" className="link-button" onClick={() => removeLine(index)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <button type="button" className="quiet" onClick={addLine}>
              Add line
            </button>
          </p>
          {kind === "purchase" ? (
            <p className="muted small">
              Blocked lines keep their reason. The server recomputes eligibility when a line is
              saved.
            </p>
          ) : null}
        </div>
      </section>

      <section className="sheet">
        <div className="sheet-pad">
          <h2>Totals</h2>
          {calcError ? <p className="error">{calcError}</p> : null}
          {!canPreview ? (
            <p className="muted">Enter a quantity and rate to preview GST.</p>
          ) : totals === null ? (
            calcError ? null : <p className="muted">Calculating…</p>
          ) : (
            <table className="narrow">
              <tbody>
                <tr>
                  <th>Taxable value</th>
                  <td className="num">{formatINR(totals.taxableValuePaise)}</td>
                </tr>
                <tr>
                  <th>CGST</th>
                  <td className="num">{formatINR(totals.cgstPaise)}</td>
                </tr>
                <tr>
                  <th>SGST</th>
                  <td className="num">{formatINR(totals.sgstPaise)}</td>
                </tr>
                <tr>
                  <th>IGST</th>
                  <td className="num">{formatINR(totals.igstPaise)}</td>
                </tr>
                {totals.cessPaise !== 0 ? (
                  <tr>
                    <th>Cess</th>
                    <td className="num">{formatINR(totals.cessPaise)}</td>
                  </tr>
                ) : null}
                {totals.roundOffPaise !== 0 ? (
                  <tr>
                    <th>Round off</th>
                    <td className="num">{formatINR(totals.roundOffPaise)}</td>
                  </tr>
                ) : null}
                <tr>
                  <th>Total</th>
                  <td className="num">{formatINR(totals.totalPaise)}</td>
                </tr>
                {kind === "sales" && totals.section ? (
                  <tr>
                    <th>GSTR-1 section</th>
                    <td className="num">{totals.section.toUpperCase()}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
        <div className="sheet-foot">
          <span className="muted small">
            {interState ? "Inter-state supply" : "Intra-state supply"}
            {business.noItcScheme ? " · no-ITC scheme" : ""}
          </span>
          <span>
            <Link href={listHref} className="small">
              Cancel
            </Link>{" "}
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : mode === "amend" ? "Save amendment" : "Save"}
            </button>
          </span>
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
