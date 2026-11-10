"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { api, errorMessage } from "@/components/api";
import type { Attachment } from "@/components/types";

interface Props {
  entityType: "sale" | "purchase" | "return" | "party";
  entityId: number;
  canDelete: boolean;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export function Attachments({ entityType, entityId, canDelete }: Props) {
  const [rows, setRows] = useState<Attachment[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<Attachment[]>(`/api/documents?entity_type=${entityType}&entity_id=${entityId}`)
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
  }, [entityType, entityId, reload]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("entity_type", entityType);
      form.set("entity_id", String(entityId));
      form.set("kind", "other");
      form.set("file", file);
      const response = await fetch("/api/documents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-Requested-With": "fetch" },
        body: form,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Upload failed (${response.status})`);
      }
      event.target.value = "";
      setReload((key) => key + 1);
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this attachment?")) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      setReload((key) => key + 1);
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sheet">
      <div className="sheet-pad">
        <h2>Attachments</h2>
        <p className="muted small">PDF, JPEG or PNG up to 10 MB. Files stay private.</p>
        <p>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={busy}
            onChange={upload}
          />
        </p>
        {error ? <p className="error">{error}</p> : null}
        {rows === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Download</th>
                {canDelete ? <th>Delete</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.filename}</td>
                  <td className="num">{sizeLabel(row.sizeBytes)}</td>
                  <td>{dateLabel(row.createdAt)}</td>
                  <td>
                    <a href={`/api/documents/${row.id}/file`}>Download</a>
                  </td>
                  {canDelete ? (
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        disabled={busy}
                        onClick={() => remove(row.id)}
                      >
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canDelete ? 5 : 4} className="muted">
                    No attachments.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
