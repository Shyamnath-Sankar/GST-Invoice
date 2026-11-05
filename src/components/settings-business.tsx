"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "./api";
import type { Business, Meta } from "./types";
import { toPaise } from "@/lib/money";
import { validateGstin, validatePan } from "@/lib/gst/gstin";

type FormState = Omit<Business, "id" | "b2clLimitPaise"> & { b2clLimit: string };

function initialState(business: Business): FormState {
  return {
    legalName: business.legalName,
    tradeName: business.tradeName,
    gstin: business.gstin,
    pan: business.pan,
    address: business.address,
    stateCode: business.stateCode,
    jurisdiction: business.jurisdiction,
    registrationType: business.registrationType,
    filingFrequency: business.filingFrequency,
    fyStartYear: business.fyStartYear,
    phone: business.phone,
    email: business.email,
    proprietor: business.proprietor,
    invoicePrefix: business.invoicePrefix,
    b2clLimit: String(business.b2clLimitPaise / 100),
    noItcScheme: business.noItcScheme,
    roundOff: business.roundOff,
    defaultPriceMode: business.defaultPriceMode,
  };
}

export function BusinessSettings({
  business,
  meta,
  owner,
  onSaved,
}: {
  business: Business;
  meta: Meta;
  owner: boolean;
  onSaved: (business: Business) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(business));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setGstin(value: string) {
    const gstin = value.toUpperCase();
    setForm((current) => ({
      ...current,
      gstin,
      stateCode:
        gstin.length >= 2 && meta.states.some((state) => state.code === gstin.slice(0, 2))
          ? gstin.slice(0, 2)
          : current.stateCode,
      pan: gstin.length === 15 && !current.pan ? gstin.slice(2, 12) : current.pan,
    }));
  }

  const gstinCheck = form.gstin ? validateGstin(form.gstin) : { ok: true, error: "" };
  const panCheck = form.pan ? validatePan(form.pan) : { ok: true, error: "" };
  const stateMismatch =
    form.gstin.length === 15 &&
    gstinCheck.ok &&
    form.gstin.slice(0, 2) !== form.stateCode;

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!gstinCheck.ok) {
      setError(`GSTIN: ${gstinCheck.error}`);
      return;
    }
    if (!panCheck.ok) {
      setError(panCheck.error);
      return;
    }
    if (stateMismatch) {
      setError("The state does not match the first two digits of the GSTIN");
      return;
    }

    setBusy(true);
    try {
      const saved = await api<Business>("/api/business", {
        method: "PUT",
        body: {
          ...form,
          fyStartYear: Number(form.fyStartYear),
          b2clLimitPaise: toPaise(form.b2clLimit),
        },
      });
      onSaved(saved);
      setForm(initialState(saved));
      setMessage("Business details saved");
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="sheet-pad">
        <h2>Business and GST details</h2>
        {!owner && (
          <p className="muted">Only the owner can change these details. You can read them here.</p>
        )}
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}

        <fieldset disabled={!owner} className="plain-fieldset">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="biz-legal">Legal name</label>
              <input
                id="biz-legal"
                value={form.legalName}
                onChange={(event) => set("legalName", event.target.value)}
              />
              <p className="muted small">As on the GST certificate.</p>
            </div>
            <div className="field">
              <label htmlFor="biz-trade">Trade name</label>
              <input
                id="biz-trade"
                value={form.tradeName}
                onChange={(event) => set("tradeName", event.target.value)}
              />
              <p className="muted small">The name printed on bills.</p>
            </div>

            <div className="field">
              <label htmlFor="biz-gstin">GSTIN</label>
              <input
                id="biz-gstin"
                value={form.gstin}
                maxLength={15}
                spellCheck={false}
                onChange={(event) => setGstin(event.target.value)}
              />
              {form.gstin && !gstinCheck.ok && (
                <p className="error small">{gstinCheck.error}</p>
              )}
              {stateMismatch && (
                <p className="error small">
                  The state does not match the first two digits of the GSTIN.
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="biz-pan">PAN</label>
              <input
                id="biz-pan"
                value={form.pan}
                maxLength={10}
                onChange={(event) => set("pan", event.target.value.toUpperCase())}
              />
              {form.pan && !panCheck.ok && <p className="error small">{panCheck.error}</p>}
              <p className="muted small">Filled from the GSTIN when empty.</p>
            </div>

            <div className="field span-2">
              <label htmlFor="biz-address">Address</label>
              <textarea
                id="biz-address"
                rows={3}
                value={form.address}
                onChange={(event) => set("address", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="biz-state">State</label>
              <select
                id="biz-state"
                value={form.stateCode}
                onChange={(event) => set("stateCode", event.target.value)}
              >
                {meta.states.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.code} {state.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="biz-jurisdiction">Jurisdiction</label>
              <input
                id="biz-jurisdiction"
                value={form.jurisdiction}
                onChange={(event) => set("jurisdiction", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="biz-registration">Registration type</label>
              <select
                id="biz-registration"
                value={form.registrationType}
                onChange={(event) =>
                  set("registrationType", event.target.value as Business["registrationType"])
                }
              >
                <option value="regular">Regular</option>
                <option value="composition">Composition</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="biz-frequency">How often returns are filed</label>
              <select
                id="biz-frequency"
                value={form.filingFrequency}
                onChange={(event) =>
                  set("filingFrequency", event.target.value as Business["filingFrequency"])
                }
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="biz-fy">Financial year starts</label>
              <input
                id="biz-fy"
                inputMode="numeric"
                value={form.fyStartYear}
                onChange={(event) =>
                  set("fyStartYear", Number(event.target.value.replace(/\D/g, "")))
                }
              />
              <p className="muted small">The year of April, for example 2026.</p>
            </div>
            <div className="field">
              <label htmlFor="biz-phone">Phone</label>
              <input
                id="biz-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="biz-email">Email</label>
              <input
                id="biz-email"
                type="email"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="biz-proprietor">Proprietor</label>
              <input
                id="biz-proprietor"
                value={form.proprietor}
                onChange={(event) => set("proprietor", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="biz-prefix">Bill number prefix</label>
              <input
                id="biz-prefix"
                value={form.invoicePrefix}
                onChange={(event) => set("invoicePrefix", event.target.value)}
              />
              <p className="muted small">For example DC/26-27/.</p>
            </div>
            <div className="field">
              <label htmlFor="biz-b2cl">B2C large limit (rupees)</label>
              <input
                id="biz-b2cl"
                inputMode="decimal"
                value={form.b2clLimit}
                onChange={(event) => set("b2clLimit", event.target.value)}
              />
              <p className="muted small">
                Bills above this to other states without a GSTIN are listed one by one.
              </p>
            </div>

            <div className="field">
              <label htmlFor="biz-price-mode">Prices on new bills</label>
              <select
                id="biz-price-mode"
                value={form.defaultPriceMode}
                onChange={(event) =>
                  set("defaultPriceMode", event.target.value as Business["defaultPriceMode"])
                }
              >
                <option value="exclusive">Before GST</option>
                <option value="inclusive">Including GST</option>
              </select>
            </div>
            <div className="field">
              <label>Scheme</label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.noItcScheme}
                  onChange={(event) => set("noItcScheme", event.target.checked)}
                />
                <span>Charge 5% without ITC on catering</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.roundOff}
                  onChange={(event) => set("roundOff", event.target.checked)}
                />
                <span>Round bill totals to the nearest rupee</span>
              </label>
            </div>
          </div>
        </fieldset>
      </div>

      {owner && (
        <div className="sheet-foot">
          <span className="muted small">
            Changes apply to new bills. Bills already written keep their details.
          </span>
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </button>
        </div>
      )}
    </form>
  );
}
