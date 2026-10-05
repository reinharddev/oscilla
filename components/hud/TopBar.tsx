"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Coins, LogOut, Moon, Pause, Sun } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { levelFromXp, useStore, xpForLevel, type Role } from "@/lib/store";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manajer", technician: "Teknisi", viewer: "Pemantau" };

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`h-7 rounded-ui border px-2.5 text-xs transition-colors duration-150 ${on ? "border-ink/40 bg-ink/10 text-ink" : "border-rule text-ink/60 hover:bg-ink/5"}`}
    >
      {children}
    </button>
  );
}

export function TopBar({ focus, onFocus }: { focus: boolean; onFocus: () => void }) {
  const { xp, coins, speed, layers, theme, auth, warehouses, setSpeed, setTheme, toggleLayer } = useStore();
  const router = useRouter();
  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("id-ID", { hour12: false }));
    t();
    const id = setInterval(t, 1000);
    return () => clearInterval(id);
  }, []);

  const lvl = levelFromXp(xp);
  const lo = xpForLevel(lvl), hi = xpForLevel(lvl + 1);
  const pct = ((xp - lo) / (hi - lo)) * 100;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 whitespace-nowrap px-3 md:gap-6 border-b border-rule bg-surface">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="truncate text-sm font-semibold">Oscilla</span>
        {warehouses.length > 1 ? (
          <select
            aria-label="Pilih gudang"
            value={auth?.warehouseId}
            onChange={(e) => router.push(`/?w=${e.target.value}`)}
            className="hidden h-7 max-w-[170px] rounded-ui border border-rule bg-surface px-2 text-xs text-ink outline-none focus:border-accent sm:block"
          >
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        ) : (
          <span className="hidden text-xs text-ink/55 sm:inline">{auth?.warehouseName}</span>
        )}
        <span className="hidden text-xs text-ink/55 xl:inline">{clock}</span>
      </div>

      <div className="hidden items-center gap-3 xl:flex">
        <span className="text-xs text-ink/55">Level</span>
        <span className="text-sm font-semibold">{lvl}</span>
        <div className="h-1 w-28 bg-ink/10"><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
        <span className="text-xs text-ink/55">{xp} / {hi} XP</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-xs text-ink/55 xl:hidden">Lv {lvl}</span>
        <Coins size={14} className="text-ink/55" />
        <span className="text-sm font-semibold">{coins}</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div role="group" aria-label="Kecepatan simulasi" className="flex overflow-hidden rounded-ui border border-rule">
          {[0, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-label={s === 0 ? "Pause" : `${s}x`}
              className={`grid h-[26px] min-w-8 place-items-center border-l border-rule px-2 text-xs first:border-l-0 transition-colors duration-150 ${speed === s ? "bg-ink/10 font-semibold text-ink" : "text-ink/60 hover:bg-ink/5"}`}
            >
              {s === 0 ? <Pause size={12} fill="currentColor" /> : `${s}×`}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <Toggle on={layers.paths} onClick={() => toggleLayer("paths")}>Paths</Toggle>
          <Toggle on={layers.zones} onClick={() => toggleLayer("zones")}>Zones</Toggle>
          <Toggle on={layers.labels} onClick={() => toggleLayer("labels")}>Labels</Toggle>
          <Toggle on={focus} onClick={onFocus}>Hide panels</Toggle>
        </div>
        <button
          onClick={() => setTheme(theme === "day" ? "night" : "day")}
          aria-label={theme === "day" ? "Aktifkan mode malam" : "Aktifkan mode siang"}
          title={theme === "day" ? "Mode malam" : "Mode siang"}
          className="grid h-7 w-7 place-items-center rounded-ui border border-rule text-ink/70 transition-colors duration-150 hover:bg-ink/5"
        >
          {theme === "day" ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        {auth && (
          <div className="ml-1 flex items-center gap-2 border-l border-rule pl-3">
            <div className="hidden text-right leading-tight lg:block">
              <div className="text-xs font-medium">{auth.name}</div>
              <div className="text-[11px] text-ink/55">{ROLE_LABEL[auth.role]}</div>
            </div>
            <form action={signOut}>
              <button aria-label="Keluar" title={`Keluar (${auth.name}, ${ROLE_LABEL[auth.role]})`} className="grid h-7 w-7 place-items-center rounded-ui border border-rule text-ink/70 transition-colors duration-150 hover:bg-ink/5">
                <LogOut size={14} />
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
