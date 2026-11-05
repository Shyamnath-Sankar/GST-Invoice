import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { findSession } from "@/server/auth-service";
import { sessionToken } from "@/server/cookies";
import { getBusiness } from "@/server/masters";
import { SignOut } from "@/components/sign-out";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await findSession(db, await sessionToken());
  if (!context) {
    redirect("/login");
  }
  const settings = await getBusiness(db);
  const name = settings.tradeName || settings.legalName || "GST-Invoice";

  return (
    <>
      <header className="topbar">
        <span className="brand">{name}</span>
        <nav className="nav" aria-label="Main">
          <Link href="/">This month</Link>
          <Link href="/parties">Parties</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <span className="muted small">
          {context.user.name} ({context.user.role})
        </span>
        <SignOut />
      </header>
      <main className="page">{children}</main>
    </>
  );
}
