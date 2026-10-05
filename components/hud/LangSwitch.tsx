"use client";

import { LANGS, LOCALE_COOKIE, type Lang } from "@/lib/i18n";
import { useStore } from "@/lib/store";

/** Segmented EN | ID control used inside the app (instant: the store holds the language). */
export function LangSwitch() {
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);
  return (
    <div role="group" aria-label="Language" className="flex overflow-hidden rounded-ui border border-rule">
      {LANGS.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`grid h-[26px] min-w-8 place-items-center border-l border-rule px-2 text-xs uppercase first:border-l-0 transition-colors duration-150 ${locale === l ? "bg-ink/10 font-semibold text-ink" : "text-ink/60 hover:bg-ink/5"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Same control for pages without the store (login): sets the cookie and reloads the server output. */
export function LangLink({ current }: { current: Lang }) {
  return (
    <div role="group" aria-label="Language" className="flex overflow-hidden rounded-ui border border-rule">
      {LANGS.map((l) => (
        <button
          key={l}
          onClick={() => { document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`; window.location.reload(); }}
          aria-pressed={current === l}
          className={`grid h-[26px] min-w-8 place-items-center border-l border-rule px-2 text-xs uppercase first:border-l-0 transition-colors duration-150 ${current === l ? "bg-ink/10 font-semibold text-ink" : "text-ink/60 hover:bg-ink/5"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
