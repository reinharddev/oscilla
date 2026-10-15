"use client";

import type { Machine } from "@/lib/health";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";

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
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {aside && <div className="text-sm text-muted-foreground">{aside}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A titled card; tables go inside with `flush` so they reach the edges. */
export function Panel({ title, description, children, flush }: { title?: string; description?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardAction className="text-sm text-muted-foreground">{description}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={flush ? "px-0" : undefined}>{children}</CardContent>
    </Card>
  );
}
