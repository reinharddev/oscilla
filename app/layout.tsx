import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warehouse Dashboard",
  description: "Gamified isometric warehouse dashboard built with Next.js, React Three Fiber and Tailwind CSS.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-theme="day" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
