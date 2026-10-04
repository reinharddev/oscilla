"use client";

import { useEffect, useState } from "react";
import { levelFromXp, useStore } from "@/lib/store";

export function LevelToast() {
  const levelUp = useStore((s) => s.levelUp);
  const xp = useStore((s) => s.xp);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!levelUp) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, [levelUp]);
  if (!show) return null;
  return (
    <div role="status" className="pointer-events-none fixed left-1/2 top-16 z-20 -translate-x-1/2 rounded-ui border border-rule bg-surface px-4 py-2.5 text-sm">
      <span className="font-semibold">Level {levelFromXp(xp)}</span> <span className="text-ink/60">tercapai</span>
    </div>
  );
}
