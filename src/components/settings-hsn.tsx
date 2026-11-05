"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "./api";
import type { Hsn, Meta } from "./types";
import { isValidHsnCode } from "@/lib/gst/hsn";
import { formatRateBp } from "@/lib/money";

type HsnForm = Omit<Hsn, "id"> & { id?: number };

function blankForm(meta: Meta): HsnForm {
  return {
    code: "",
    description: "",
    isService: true,
    defaultRateBp: meta.rates[0]?.rateBp ?? 500,
    supplyKind: "taxable",
    uqc: "NA",
    itcAllowed: false,
    notes: "",
    active: true,
  };
}

export function HsnSettings({ meta }: { meta: Meta }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Hsn[] | null>(null);
  const [form, setForm] = useState<HsnForm>(() => blankForm(meta));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<Hsn[]>(`/api/hsn?q=${encodeURIComponent(query.trim())}`)
      .then((result) => {
        if (!cancelled) {
          setRows(result);
        }
      })
      .catch((problem) => {
        if (!cancelled) {
          setError(errorMessage(problem));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey]);

  function set<K extends keyof HsnForm>(key: K, value: HsnForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(row: Hsn) {
    setForm({ ...row });
    setError("");
    setMessage("");
  }

  function reset() {
    setForm(blankForm(meta));
  }

  const codeProblem =
    form.code !== "" && !isValidHsnCode(form.code) ? "Use 4, 6 or 8 digits" : "";

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (codeProblem || !form.description.trim()) {
      setError(codeProblem || "Description is required");
      return;
    }
    setBusy(true);
    try {
      const body = { ...form, id: undefined };
      const id = form.id;
      await api(id ? `/api/hsn/${id}` : "/api/hsn", {
        method: id ? "PUT" : "POST",
        body,
      });
      setMessage(id ? "Code updated" : "Code added");
      reset();
      setReloadKey((key) => key + 1);
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sheet-pad">
        <h2>HSN / SAC codes</h2>
        <div className="toolbar">
          <div className="field grow">
            <label htmlFor="hsn-search">Search codes</label>
            <input
              id="hsn-search"
              placeholder="Code or description"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}

        {rows === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th className="num">Rate</th>
                <th>Supply type</th>
                <th>Unit</th>
                <th>Notes</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b className="num">{row.code}</b>
                    {!row.active && <span className="muted small"> (not in use)</span>}
                  </td>
                  <td>
                    {row.description}
                    {!row.isService && <span className="muted small"> (goods)</span>}
                  </td>
                  <td className="num">{formatRateBp(row.defaultRateBp)}</td>
                  <td>{row.supplyKind}</td>
                  <td>{row.uqc}</td>
                  <td className="small">{row.notes}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => edit(row)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    {query ? "No codes match that search." : "No codes yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <form onSubmit={save}>
        <div className="sheet-pad">
          <h3>{form.id ? `Edit ${form.code}` : "Add an HSN or SAC code"}</h3>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="hsn-code">Code</label>
              <input
                id="hsn-code"
                inputMode="numeric"
                value={form.code}
                onChange={(event) => set("code", event.target.value.replace(/\D/g, ""))}
              />
              {codeProblem && <p className="error small">{codeProblem}</p>}
            </div>
            <div className="field">
              <label htmlFor="hsn-service">Goods or service</label>
              <select
                id="hsn-service"
                value={form.isService ? "s" : "g"}
                onChange={(event) => set("isService", event.target.value === "s")}
              >
                <option value="s">Service (SAC)</option>
                <option value="g">Goods (HSN)</option>
              </select>
            </div>

            <div className="field span-2">
              <label htmlFor="hsn-description">Description</label>
              <input
                id="hsn-description"
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="hsn-rate">Default rate</label>
              <select
                id="hsn-rate"
                value={form.defaultRateBp}
                onChange={(event) => set("defaultRateBp", Number(event.target.value))}
              >
                {meta.rates.map((rate) => (
                  <option key={rate.id} value={rate.rateBp}>
                    {formatRateBp(rate.rateBp)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="hsn-kind">Supply type</label>
              <select
                id="hsn-kind"
                value={form.supplyKind}
                onChange={(event) => set("supplyKind", event.target.value)}
              >
                {meta.supplyKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="hsn-uqc">Unit (UQC)</label>
              <select
                id="hsn-uqc"
                value={form.uqc}
                onChange={(event) => set("uqc", event.target.value)}
              >
                {meta.uqc.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
            <div className="field span-2">
              <label htmlFor="hsn-notes">Notes</label>
              <textarea
                id="hsn-notes"
                rows={2}
                value={form.notes}
                onChange={(event) => set("notes", event.target.value)}
              />
            </div>

            <div className="field span-2">
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.itcAllowed}
                  onChange={(event) => set("itcAllowed", event.target.checked)}
                />
                <span>Input tax credit can be claimed on this</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => set("active", event.target.checked)}
                />
                <span>In use (shown when writing bills)</span>
              </label>
            </div>
          </div>
        </div>
        <div className="sheet-foot">
          {form.id ? (
            <button type="button" className="quiet" onClick={reset}>
              Cancel edit
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : form.id ? "Save code" : "Add code"}
          </button>
        </div>
      </form>
    </>
  );
}
