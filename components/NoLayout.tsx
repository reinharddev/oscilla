import { signOut } from "@/app/login/actions";
import type { Key, Lang } from "@/lib/i18n";
import { makeT } from "@/lib/i18n";

export default function NoLayout({ name, warehouses, reason, lang }: { name: string; warehouses: string[]; reason: Key; lang: Lang }) {
  const t = makeT(lang);
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-ui border border-rule bg-surface p-5">
        <h1 className="text-base font-semibold">{t("nolayout.title")}</h1>
        <p className="mt-2 text-sm text-ink/70">
          {t("nolayout.hello", { name, reason: t(reason) })}{warehouses.length > 0 && ` (${warehouses.join(", ")})`}
        </p>
        <form action={signOut} className="mt-4">
          <button className="h-8 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5">{t("common.signOut")}</button>
        </form>
      </div>
    </main>
  );
}
