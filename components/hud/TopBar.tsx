"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { dateLocale, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { LangSwitch } from "./LangSwitch";

export function TopBar() {
  const { demo, theme, auth, warehouses, setTheme } = useStore();
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString(dateLocale(lang), { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lang]);
  const role = (r: string) => t(`role.${r}` as Key);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 whitespace-nowrap px-3 md:gap-6 border-b border-rule bg-surface">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="truncate text-sm font-semibold">Oscilla</span>
        {warehouses.length > 1 ? (
          <select
            aria-label={t("top.chooseWarehouse")}
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

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button onClick={() => { const d = useStore.getState().demo; if (d.open) useStore.getState().demoReset(); else useStore.getState().demoPrepare(); }} aria-pressed={demo.open} className={`h-7 rounded-ui border px-2.5 text-xs font-medium transition-colors duration-150 ${demo.open ? "border-accent bg-accent text-canvas" : "border-accent text-accent hover:bg-accent/10"}`}>{t("top.demo")}</button>
        <button
          onClick={() => setTheme(theme === "day" ? "night" : "day")}
          aria-label={theme === "day" ? t("top.toNight") : t("top.toDay")}
          title={theme === "day" ? t("top.night") : t("top.day")}
          className="grid h-7 w-7 place-items-center rounded-ui border border-rule text-ink/70 transition-colors duration-150 hover:bg-ink/5"
        >
          {theme === "day" ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        <LangSwitch />
        {auth && (
          <div className="ml-1 flex items-center gap-2 border-l border-rule pl-3">
            <div className="hidden text-right leading-tight lg:block">
              <div className="text-xs font-medium">{auth.name}</div>
              <div className="text-[11px] text-ink/55">{role(auth.role)}</div>
            </div>
            <form action={signOut}>
              <button aria-label={t("common.signOut")} title={t("common.signOutAs", { name: auth.name, role: role(auth.role) })} className="grid h-7 w-7 place-items-center rounded-ui border border-rule text-ink/70 transition-colors duration-150 hover:bg-ink/5">
                <LogOut size={14} />
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
