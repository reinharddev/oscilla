import { LangLink } from "@/components/hud/LangSwitch";
import { getT } from "@/lib/i18n/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const { lang, t } = await getT();
  const demoEnabled = Boolean(process.env.DEMO_PASSWORD);
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">Oscilla</h1>
          <LangLink current={lang} />
        </div>
        <p className="mt-1 text-sm text-ink/60">{t("app.tagline")}</p>
        <LoginForm demoEnabled={demoEnabled} lang={lang} />
      </div>
    </main>
  );
}
