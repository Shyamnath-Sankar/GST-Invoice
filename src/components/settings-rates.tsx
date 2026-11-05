"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "./api";
import type { Meta, TaxRate } from "./types";
import { formatRateBp, percentToBp } from "@/lib/money";

export function RateSettings({
  meta,
  owner,
  reloadMeta,
}: {
  meta: Meta;
  owner: boolean;
  reloadMeta: () => Promise<void>;
}) {
  const [rate, setRate] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await api<TaxRate>("/api/tax-rates", {
        body: { rateBp: percentToBp(Number(rate)), label },
      });
      setRate("");
      setLabel("");
      await reloadMeta();
      setMessage("Rate added");
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: TaxRate) {
    setError("");
    setMessage("");
    try {
      await api(`/api/tax-rates/${row.id}`, {
        method: "PUT",
        body: { label: row.label, active: !row.active },
      });
      await reloadMeta();
    } catch (problem) {
      setError(errorMessage(problem));
    }
  }

  return (
    <>
      <div className="sheet-pad">
        <h2>GST rates</h2>
        <p className="muted">
          Rates are set by GST law. Change them only when your accountant tells you.
        </p>
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}
        <table>
          <thead>
            <tr>
              <th>Rate</th>
              <th>Label</th>
              <th>In use</th>
            </tr>
          </thead>
          <tbody>
            {meta.rates.map((row) => (
              <tr key={row.id}>
                <td className="num">
                  <b>{formatRateBp(row.rateBp)}</b>
                </td>
                <td>{row.label || <span className="muted">No label</span>}</td>
                <td>
                  {owner ? (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={() => toggle(row)}
                      />
                      <span>{row.active ? "Shown on bills" : "Hidden"}</span>
                    </label>
                  ) : (
                    <span>{row.active ? "Shown on bills" : "Hidden"}</span>
                  )}
                </td>
              </tr>
            ))}
            {meta.rates.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No rates yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {owner && (
        <form onSubmit={add}>
          <div className="sheet-pad">
            <h3>Add a rate</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="rate-value">Rate in percent</label>
                <input
                  id="rate-value"
                  inputMode="decimal"
                  required
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="rate-label">Label</label>
                <input
                  id="rate-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="sheet-foot">
            <span />
            <button type="submit" disabled={busy || rate === ""}>
              {busy ? "Adding…" : "Add rate"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
