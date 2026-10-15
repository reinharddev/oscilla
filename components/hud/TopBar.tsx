"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Key } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { canWrite, useStore } from "@/lib/store";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

export function TopBar() {
  const { demo, theme, auth, warehouses, setTheme } = useStore();
  const t = useT();
  const role = (r: string) => t(`role.${r}` as Key);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3 md:px-4">
      <span className="text-sm font-semibold tracking-tight">Oscilla</span>
      {warehouses.length > 1 ? (
        <Select value={auth?.warehouseId} onValueChange={(id) => void useStore.getState().loadWorkspace(id)}>
          <SelectTrigger size="sm" className="hidden max-w-[220px] sm:flex" aria-label={t("top.chooseWarehouse")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <span className="hidden text-xs text-muted-foreground sm:inline">{auth?.warehouseName}</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {canWrite(auth) && (
          <Button
            variant={demo.open ? "default" : "outline"}
            size="sm"
            aria-pressed={demo.open}
            onClick={() => { const d = useStore.getState().demo; if (d.open) void useStore.getState().demoReset(); else void useStore.getState().demoPrepare(); }}
          >
            {t("top.demo")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(theme === "day" ? "night" : "day")}
          aria-label={theme === "day" ? t("top.toNight") : t("top.toDay")}
          title={theme === "day" ? t("top.night") : t("top.day")}
        >
          {theme === "day" ? <Moon /> : <Sun />}
        </Button>
        {auth && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 gap-2 px-1.5" aria-label={auth.name}>
                <Avatar className="size-6"><AvatarFallback className="text-[10px]">{initials(auth.name)}</AvatarFallback></Avatar>
                <span className="hidden text-left leading-tight lg:block">
                  <span className="block text-xs font-medium">{auth.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{role(auth.role)}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span>{auth.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{auth.email} · {role(auth.role)}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <form action={signOut}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full"><LogOut />{t("common.signOut")}</button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
