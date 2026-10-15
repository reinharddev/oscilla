"use client";

import { useStore } from "@/lib/store";
import type { Machine } from "@/lib/health";

/** Opens a machine in the Machines screen, from any other screen. */
export function useOpenMachine() {
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  return (m: Machine | undefined) => {
    if (!m) return;
    select(m);
    setView("machines");
    useStore.getState().showTab("machine");
  };
}

export function Page({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-sm font-semibold">{title}</h1>
          {aside && <div className="text-xs text-ink/55">{aside}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Panel({ title, aside, children }: { title?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-5 border border-rule bg-surface">
      {title && (
        <div className="flex items-baseline justify-between border-b border-rule px-4 py-2.5">
          <h2 className="text-xs font-semibold text-ink/70">{title}</h2>
          {aside && <span className="text-xs text-ink/45">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export const th = "px-3 py-2 text-left text-xs font-normal text-ink/50";
export const td = "px-3 py-2 align-top";
