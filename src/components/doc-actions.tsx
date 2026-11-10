"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/components/api";

interface Props {
  kind: "sales" | "purchase";
  id: number;
  status: string;
}

export function DocumentActions({ kind, id, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (status !== "active") {
    return <span className="muted small">{status}</span>;
  }

  async function cancel() {
    if (!window.confirm("Cancel this document? The number stays used.")) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api(`/api/${kind}/${id}/cancel`, { method: "POST" });
      router.refresh();
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      {kind === "sales" ? <Link href={`/sales/${id}?amend=1`}>Amend</Link> : null}{" "}
      <button type="button" className="link-button" disabled={busy} onClick={cancel}>
        Cancel
      </button>
      {error ? <span className="error small"> {error}</span> : null}
    </span>
  );
}
