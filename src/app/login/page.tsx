"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/components/api";
import type { Me } from "@/components/types";

interface Status {
  needsSetup: boolean;
  user: Me | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Status>("/api/auth/status")
      .then((result) => {
        if (result.user) {
          router.replace("/");
          return;
        }
        setStatus(result);
      })
      .catch((problem) => setError(errorMessage(problem)));
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!status) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (status.needsSetup) {
        await api("/api/auth/setup", { body: { name, email, password } });
      } else {
        await api("/api/auth/login", { body: { email, password } });
      }
      router.replace("/");
      router.refresh();
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  if (!status && !error) {
    return (
      <main className="page narrow">
        <h1>GST-Invoice</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const setup = status?.needsSetup ?? false;

  return (
    <main className="page narrow">
      <h1>GST-Invoice</h1>
      <h2>{setup ? "Create the owner account" : "Sign in"}</h2>
      <p className="muted">
        {setup
          ? "This is the first visit. The owner can change settings and add people later."
          : "Use the email and password for this business."}
      </p>

      {error && <p className="error">{error}</p>}

      <form onSubmit={submit}>
        {setup && (
          <div className="field">
            <label htmlFor="login-name">Name</label>
            <input
              id="login-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={setup ? "new-password" : "current-password"}
            minLength={setup ? 10 : undefined}
            required
          />
          {setup && (
            <p className="muted small">At least 10 characters, with letters and numbers.</p>
          )}
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "Please wait…" : setup ? "Create owner account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
