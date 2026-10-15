import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";
import LoginForm from "./LoginForm";
import Preview from "./Preview";

export default async function LoginPage() {
  const { lang, t } = await getT();
  const demoEnabled = Boolean(process.env.DEMO_PASSWORD);
  return (
    <main className="grid h-dvh overflow-y-auto bg-background lg:grid-cols-2">
      <section className="flex flex-col gap-8 px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/"><ArrowLeft data-icon="inline-start" />{t("login.back")}</Link>
          </Button>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 pb-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Oscilla</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("app.tagline")}</p>
          </div>
          <LoginForm demoEnabled={demoEnabled} lang={lang} />
        </div>
      </section>
      <aside className="hidden items-center justify-center border-l bg-muted/40 p-10 lg:flex">
        <Preview lang={lang} />
      </aside>
    </main>
  );
}
