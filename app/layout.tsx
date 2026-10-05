import type { Metadata } from "next";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oscilla",
  description: "Gamified isometric warehouse dashboard built with Next.js, React Three Fiber and Tailwind CSS.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} data-theme="day" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
