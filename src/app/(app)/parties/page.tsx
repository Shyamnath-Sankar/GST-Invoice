"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/components/api";
import type { Meta, Party } from "@/components/types";
import { stateName, validateGstin } from "@/lib/gst/gstin";

type PartyForm = Omit<Party, "id"> & { id?: number };

const BLANK: PartyForm = {
  kind: "customer",
  name: "",
  gstin: "",
  address: "",
  stateCode: "",
  phone: "",
  email: "",
  active: true,
};

export default function PartiesPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Party[] | null>(null);
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form, setForm] = useState<PartyForm>({ ...BLANK });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api<Meta>("/api/meta")
      .then(setMeta)
      .catch((problem) => setError(errorMessage(problem)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (kind) {
      params.set("kind", kind);
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (includeInactive) {
      params.set("includeInactive", "true");
    }
    api<Party[]>(`/api/parties?${params.toString()}`)
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
  }, [kind, query, includeInactive, reloadKey]);

  function set<K extends keyof PartyForm>(key: K, value: PartyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setGstin(value: string) {
    const gstin = value.toUpperCase();
    setForm((current) => ({
      ...current,
      gstin,
      stateCode:
        gstin.length >= 2
          ? gstin.slice(0, 2)
          : current.stateCode,
    }));
  }

  function edit(row: Party) {
    setForm({ ...row });
    setError("");
    setMessage("");
  }

  function reset() {
    setForm({ ...BLANK });
  }

  const gstinCheck = form.gstin ? validateGstin(form.gstin) : { ok: true, error: "" };

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!gstinCheck.ok) {
      setError(`GSTIN: ${gstinCheck.error}`);
      return;
    }
    setBusy(true);
    try {
      const id = form.id;
      await api(id ? `/api/parties/${id}` : "/api/parties", {
        method: id ? "PUT" : "POST",
        body: { ...form, id: undefined },
      });
      setMessage(id ? "Party updated" : "Party added");
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
      <h1>Parties</h1>
      <p className="muted">Customers and suppliers used on sales and purchase bills.</p>

      <section className="sheet">
        <div className="sheet-pad">
          <div className="toolbar">
            <div className="field">
              <label htmlFor="party-kind-filter">Kind</label>
              <select
                id="party-kind-filter"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="">All</option>
                <option value="customer">Customers</option>
                <option value="supplier">Suppliers</option>
              </select>
            </div>
            <div className="field grow">
              <label htmlFor="party-search">Search</label>
              <input
                id="party-search"
                placeholder="Name, GSTIN or phone"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              <span>Show inactive</span>
            </label>
          </div>

          {message && <p className="ok">{message}</p>}
          {error && <p className="error">{error}</p>}

          {rows === null ? (
            <p className="muted">Loading…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>GSTIN</th>
                  <th>State</th>
                  <th>Phone</th>
                  <th>Active</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.kind}</td>
                    <td className="num">{row.gstin || "—"}</td>
                    <td>
                      {row.stateCode} {stateName(row.stateCode) ?? ""}
                    </td>
                    <td>{row.phone}</td>
                    <td>{row.active ? "Yes" : "No"}</td>
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
                      No parties match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <form className="sheet" onSubmit={save}>
        <div className="sheet-pad">
          <h2>{form.id ? `Edit ${form.name}` : "Add a party"}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="party-kind">Kind</label>
              <select
                id="party-kind"
                value={form.kind}
                onChange={(event) =>
                  set("kind", event.target.value as Party["kind"])
                }
              >
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="party-name">Name</label>
              <input
                id="party-name"
                required
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="party-gstin">GSTIN</label>
              <input
                id="party-gstin"
                maxLength={15}
                spellCheck={false}
                value={form.gstin}
                onChange={(event) => setGstin(event.target.value)}
              />
              {form.gstin && !gstinCheck.ok && (
                <p className="error small">{gstinCheck.error}</p>
              )}
            </div>
            <div className="field">
              <label htmlFor="party-state">State</label>
              <select
                id="party-state"
                value={form.stateCode}
                onChange={(event) => set("stateCode", event.target.value)}
              >
                <option value="">Use the business state</option>
                {(meta?.states ?? []).map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.code} {state.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field span-2">
              <label htmlFor="party-address">Address</label>
              <textarea
                id="party-address"
                rows={2}
                value={form.address}
                onChange={(event) => set("address", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="party-phone">Phone</label>
              <input
                id="party-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="party-email">Email</label>
              <input
                id="party-email"
                type="email"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </div>

            <div className="field span-2">
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
            {busy ? "Saving…" : form.id ? "Save party" : "Add party"}
          </button>
        </div>
      </form>
    </>
  );
}
