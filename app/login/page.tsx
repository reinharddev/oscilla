import { LangLink } from "@/components/hud/LangSwitch";
import { getT } from "@/lib/i18n/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const { lang, t } = await getT();
  const demoEnabled = Boolean(process.env.DEMO_PASSWORD);
  return (
    <main className="grid h-dvh place-items-start justify-center overflow-y-auto bg-background px-4 py-10 sm:place-items-center">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Oscilla</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("app.tagline")}</p>
          </div>
          <LangLink current={lang} />
        </div>
        <LoginForm demoEnabled={demoEnabled} lang={lang} />
      </div>
    </main>
  );
}
