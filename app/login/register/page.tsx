import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LangLink } from "@/components/hud/LangSwitch";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";
import Preview from "../Preview";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  const { lang, t } = await getT();
  return (
    <main className="grid h-dvh overflow-y-auto bg-background lg:grid-cols-2">
      <section className="flex flex-col gap-8 px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login"><ArrowLeft data-icon="inline-start" />{t("login.submit")}</Link>
          </Button>
          <LangLink current={lang} />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 pb-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("login.registerTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("login.registerNote")}</p>
          </div>
          <RegisterForm lang={lang} />
        </div>
      </section>
      <aside className="hidden items-center justify-center border-l bg-muted/40 p-10 lg:flex">
        <Preview lang={lang} />
      </aside>
    </main>
  );
}
