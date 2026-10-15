import type { Metadata } from "next";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oscilla",
  description: "Predictive maintenance for warehouse fleets: machine health from vibration, a cited Maintenance Copilot, and work orders.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} data-theme="day" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
