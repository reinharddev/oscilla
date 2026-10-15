import type { Metadata } from "next";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Oscilla",
  description: "Predictive maintenance for warehouse fleets: machine health from vibration, a cited Maintenance Copilot, and work orders.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        {/* Applies the saved theme before the first paint so there is no flash. Dark is the default. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("wt-theme");if(t!=="day"){document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}` }} />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
