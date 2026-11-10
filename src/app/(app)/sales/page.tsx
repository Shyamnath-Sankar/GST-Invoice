"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/components/api";
import { formatINR } from "@/lib/money";
import { DocumentActions } from "@/components/doc-actions";
import type { SaleRecord, SalesListResult } from "@/components/types";

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function monthStart(): string {
  return `${localToday().slice(0, 7)}-01`;
}

export default function SalesPage() {
  const [rows, setRows] = useState<SaleRecord[] | null>(null);
  const [sums, setSums] = useState<SalesListResult["sums"] | null>(null);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localToday());
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ from, to, size: "100" });
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (section) {
      params.set("section", section);
    }
    if (status) {
      params.set("status", status);
    }
    api<SalesListResult>(`/api/sales?${params.toString()}`)
      .then((result) => {
        if (!cancelled) {
          setRows(result.rows);
          setSums(result.sums);
          setTotal(result.total);
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
  }, [from, to, query, section, status, reload]);

  return (
    <>
      <div className="toolbar">
        <h1 className="grow">Sales</h1>
        <Link href="/sales/new">New sale</Link>
      </div>

      <section className="sheet">
        <div className="sheet-pad">
          <div className="toolbar">
            <div className="field">
              <label htmlFor="sales-from">From</label>
              <input
                id="sales-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="sales-to">To</label>
              <input
                id="sales-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div className="field grow">
              <label htmlFor="sales-search">Search</label>
              <input
                id="sales-search"
                placeholder="Number, party or GSTIN"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="sales-section">Section</label>
              <select
                id="sales-section"
                value={section}
                onChange={(event) => setSection(event.target.value)}
              >
                <option value="">All</option>
                <option value="b2b">B2B</option>
                <option value="b2c">B2C</option>
                <option value="b2cl">B2CL</option>
                <option value="b2cs">B2CS</option>
                <option value="exp">Export</option>
                <option value="cdnr">CDNR</option>
                <option value="cdnur">CDNUR</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="sales-status">Status</label>
              <select
                id="sales-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
                <option value="amended">Amended</option>
              </select>
            </div>
            <button type="button" className="quiet" onClick={() => setReload((key) => key + 1)}>
              Refresh
            </button>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {rows === null ? (
            <p className="muted">Loading…</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Date</th>
                  <th>Party</th>
                  <th>GSTIN</th>
                  <th>Section</th>
                  <th>Taxable</th>
                  <th>Tax</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Files</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tax =
                    row.cgstPaise + row.sgstPaise + row.igstPaise + row.cessPaise;
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/sales/${row.id}`}>{row.number}</Link>
                      </td>
                      <td>{row.date}</td>
                      <td>{row.partyName}</td>
                      <td className="num">{row.partyGstin || "—"}</td>
                      <td>{row.section.toUpperCase()}</td>
                      <td className="num">{formatINR(row.taxableValuePaise)}</td>
                      <td className="num">{formatINR(tax)}</td>
                      <td className="num">{formatINR(row.totalPaise)}</td>
                      <td>{row.status}</td>
                      <td className="num">{row.attachments ?? 0}</td>
                      <td>
                        <DocumentActions kind="sales" id={row.id} status={row.status} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="muted">
                      No sales match.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {sums ? (
                <tfoot>
                  <tr>
                    <th colSpan={5}>{total} documents</th>
                    <th className="num">{formatINR(sums.taxableValuePaise)}</th>
                    <th className="num">{formatINR(sums.taxPaise)}</th>
                    <th className="num">{formatINR(sums.totalPaise)}</th>
                    <th colSpan={3} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          )}
        </div>
      </section>
    </>
  );
}
