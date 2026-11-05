import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GST-Invoice",
  description: "GST accounting, GSTR-1 and GSTR-3B",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
