import Link from "next/link";
import { db } from "@/db/client";
import { getMeta } from "@/server/masters";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const meta = await getMeta(db);
  const label =
    meta.periods.find((period) => period.key === meta.currentPeriod)?.label ??
    meta.currentPeriod;

  return (
    <>
      <h1>This month</h1>
      <p className="muted">
        Period {label} ({meta.currentPeriod}) · financial year {meta.currentFy}
      </p>

      <section className="sheet">
        <h2>Getting started</h2>
        <p>
          Set the business details, GST rates and HSN/SAC codes in{" "}
          <Link href="/settings">Settings</Link>, then add customers and suppliers in{" "}
          <Link href="/parties">Parties</Link>.
        </p>
        <p className="muted small">
          Sales, purchases, returns and reports arrive in the next phases. Totals will appear
          here once bills are entered.
        </p>
      </section>
    </>
  );
}
