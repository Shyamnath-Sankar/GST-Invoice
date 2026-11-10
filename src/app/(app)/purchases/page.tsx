"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/components/api";
import { formatINR } from "@/lib/money";
import { DocumentActions } from "@/components/doc-actions";
import type { PurchaseListResult, PurchaseRecord } from "@/components/types";

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function monthStart(): string {
  return `${localToday().slice(0, 7)}-01`;
}

export default function PurchasesPage() {
  const [rows, setRows] = useState<PurchaseRecord[] | null>(null);
  const [sums, setSums] = useState<PurchaseListResult["sums"] | null>(null);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localToday());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [itc, setItc] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ from, to, size: "100" });
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (category) {
      params.set("category", category);
    }
    if (itc) {
      params.set("itc", itc);
    }
    if (status) {
      params.set("status", status);
    }
    api<PurchaseListResult>(`/api/purchases?${params.toString()}`)
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
  }, [from, to, query, category, itc, status, reload]);

  return (
    <>
      <div className="toolbar">
        <h1 className="grow">Purchases</h1>
        <Link href="/purchases/new">New bill</Link>
      </div>

      <section className="sheet">
        <div className="sheet-pad">
          <div className="toolbar">
            <div className="field">
              <label htmlFor="purchases-from">From</label>
              <input
                id="purchases-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="purchases-to">To</label>
              <input
                id="purchases-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <div className="field grow">
              <label htmlFor="purchases-search">Search</label>
              <input
                id="purchases-search"
                placeholder="Bill number, supplier or GSTIN"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="purchases-category">Category</label>
              <select
                id="purchases-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">All</option>
                <option value="inputs">Inputs</option>
                <option value="input_services">Input services</option>
                <option value="capital_goods">Capital goods</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="purchases-itc">ITC</label>
              <select id="purchases-itc" value={itc} onChange={(event) => setItc(event.target.value)}>
                <option value="">All</option>
                <option value="eligible">Eligible</option>
                <option value="ineligible">Blocked</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="purchases-status">Status</label>
              <select
                id="purchases-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
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
                  <th>Bill</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>GSTIN</th>
                  <th>Category</th>
                  <th>ITC period</th>
                  <th>Taxable</th>
                  <th>Tax</th>
                  <th>Eligible ITC</th>
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
                        <Link href={`/purchases/${row.id}`}>{row.number}</Link>
                      </td>
                      <td>{row.date}</td>
                      <td>{row.supplierName}</td>
                      <td className="num">{row.supplierGstin || "—"}</td>
                      <td>{row.category.replace("_", " ")}</td>
                      <td>{row.itcPeriod}</td>
                      <td className="num">{formatINR(row.taxableValuePaise)}</td>
                      <td className="num">{formatINR(tax)}</td>
                      <td className="num">{formatINR(row.itcEligiblePaise ?? 0)}</td>
                      <td className="num">{formatINR(row.totalPaise)}</td>
                      <td>{row.status}</td>
                      <td className="num">{row.attachments ?? 0}</td>
                      <td>
                        <DocumentActions kind="purchase" id={row.id} status={row.status} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="muted">
                      No bills match.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {sums ? (
                <tfoot>
                  <tr>
                    <th colSpan={6}>{total} bills</th>
                    <th className="num">{formatINR(sums.taxableValuePaise)}</th>
                    <th className="num">{formatINR(sums.taxPaise)}</th>
                    <th colSpan={2} className="num">
                      {formatINR(sums.totalPaise)}
                    </th>
                    <th colSpan={4} />
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
