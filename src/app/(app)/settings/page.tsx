"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/components/api";
import type { Business, Me, Meta } from "@/components/types";
import { BusinessSettings } from "@/components/settings-business";
import { RateSettings } from "@/components/settings-rates";
import { HsnSettings } from "@/components/settings-hsn";

const TABS = [
  { key: "business", label: "Business & GST" },
  { key: "rates", label: "Tax rates" },
  { key: "hsn", label: "HSN / SAC codes" },
  { key: "users", label: "Users" },
  { key: "audit", label: "Audit log" },
  { key: "backup", label: "Backup" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("business");
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState("");

  const loadMeta = useCallback(async () => {
    setMeta(await api<Meta>("/api/meta"));
  }, []);

  useEffect(() => {
    Promise.all([
      api<{ user: Me }>("/api/auth/me"),
      api<Meta>("/api/meta"),
      api<Business>("/api/business"),
    ])
      .then(([session, nextMeta, settings]) => {
        setMe(session.user);
        setMeta(nextMeta);
        setBusiness(settings);
      })
      .catch((problem) => setError(errorMessage(problem)));
  }, []);

  if (error) {
    return (
      <>
        <h1>Settings</h1>
        <p className="error">{error}</p>
      </>
    );
  }

  if (!meta || !business || !me) {
    return (
      <>
        <h1>Settings</h1>
        <p className="muted">Loading…</p>
      </>
    );
  }

  const owner = me.role === "owner";

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">
        Your business details, GST rates and codes. Only the owner can change the business
        details and tax rates.
      </p>

      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="sheet" role="tabpanel">
        {tab === "business" && (
          <BusinessSettings
            business={business}
            meta={meta}
            owner={owner}
            onSaved={(saved) => {
              setBusiness(saved);
              void loadMeta();
            }}
          />
        )}
        {tab === "rates" && (
          <RateSettings meta={meta} owner={owner} reloadMeta={loadMeta} />
        )}
        {tab === "hsn" && <HsnSettings meta={meta} />}
        {tab === "users" && (
          <div className="sheet-pad">
            <h2>Users</h2>
            <p>Managing other people and their roles arrives in a later phase.</p>
            <p className="muted small">
              For now the owner account is the only way in. Sessions can be ended from the
              sign-in API.
            </p>
          </div>
        )}
        {tab === "audit" && (
          <div className="sheet-pad">
            <h2>Audit log</h2>
            <p>The audit viewer arrives in a later phase.</p>
            <p className="muted small">
              Every change to the business details, rates, codes and parties is already
              recorded.
            </p>
          </div>
        )}
        {tab === "backup" && (
          <div className="sheet-pad">
            <h2>Backup</h2>
            <p>Downloading a full backup arrives in a later phase.</p>
            <p className="muted small">
              Neon keeps automatic backups. A downloadable copy is extra safety you hold
              yourself.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
