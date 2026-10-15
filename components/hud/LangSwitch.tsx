"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LANGS, LOCALE_COOKIE, type Lang } from "@/lib/i18n";
import { useStore } from "@/lib/store";

function Switcher({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && onChange(v as Lang)} aria-label="Language" spacing={0}>
      {LANGS.map((l) => (
        <ToggleGroupItem key={l} value={l} className="px-2 text-xs uppercase">{l}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** EN | ID inside the app (instant: the store holds the language). */
export function LangSwitch() {
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);
  return <Switcher value={locale} onChange={setLocale} />;
}

/** Same control for pages without the store (login): sets the cookie and reloads the server output. */
export function LangLink({ current }: { current: Lang }) {
  return (
    <Switcher
      value={current}
      onChange={(l) => {
        document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
    />
  );
}
