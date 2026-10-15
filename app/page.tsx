import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { LinkIcon } from "@/components/brand-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/lib/i18n/server";
import type { Key } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/server/auth";
import { REPO_URL, TEAM_MEMBERS, TEAM_NAME } from "@/lib/team";

export const metadata = {
  title: "Oscilla: predictive maintenance for warehouse fleets",
  description: "Machine health from vibration, a cited Maintenance Copilot, and work orders, with a different screen for each role.",
};

const STACK = ["Next.js 16", "React 19", "shadcn/ui", "Tailwind CSS", "Supabase (Postgres, RLS)", "FastAPI", "NumPy / SciPy", "vLLM / ROCm"];

export default async function Landing() {
  const { lang, t } = await getT();
  const supabase = await createClient();
  const signedIn = Boolean(await getAuthUser(supabase));

  const problems = [1, 2, 3] as const;
  const steps = [1, 2, 3, 4, 5] as const;
  const roles = ["technician", "manager", "admin", "viewer"] as const;
  const section = "scroll-mt-20 border-t py-14";
  const h2 = "text-2xl font-semibold tracking-tight";

  return (
    <div className="h-dvh overflow-y-auto bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">Oscilla</Link>
          <nav className="ml-4 hidden gap-5 text-sm text-muted-foreground md:flex" aria-label="Sections">
            <a href="#problem" className="hover:text-foreground">{t("land.nav.problem")}</a>
            <a href="#how" className="hover:text-foreground">{t("land.nav.how")}</a>
            <a href="#roles" className="hover:text-foreground">{t("land.nav.roles")}</a>
            <a href="#evidence" className="hover:text-foreground">{t("land.nav.evidence")}</a>
            <a href="#team" className="hover:text-foreground">{t("land.nav.team")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm"><Link href={signedIn ? "/app" : "/login"}>{signedIn ? t("land.openApp") : t("land.signIn")}</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="grid gap-10 py-16 md:grid-cols-[1.15fr_1fr] md:items-center md:py-24">
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">{t("land.eyebrow")}</p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">{t("land.h1")}</h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">{t("land.lead")}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/login">{t("land.ctaDemo")}<ArrowRight data-icon="inline-end" /></Link></Button>
              <Button asChild size="lg" variant="outline"><a href="#how">{t("land.ctaHow")}</a></Button>
            </div>
          </div>

          <Card size="sm" aria-label={t("land.sample")}>
            <CardHeader><CardTitle className="text-xs font-normal text-muted-foreground">{t("land.sample")}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-0">{t("land.sample.machine")}</TableHead>
                    <TableHead>{t("land.sample.status")}</TableHead>
                    <TableHead className="text-right">{t("land.sample.score")}</TableHead>
                    <TableHead className="hidden pr-0 text-right sm:table-cell">{t("land.sample.life")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ["Forklift FK-02", "critical", t("status.critical"), "36", "≈ 17 d"],
                    ["AGV Robot R2", "attention", t("status.attention"), "53", "≈ 30 d"],
                    ["Scan Drone D1", "healthy", t("status.healthy"), "86", "–"],
                  ].map(([name, st, label, score, life]) => (
                    <TableRow key={name}>
                      <TableCell className="pl-0 font-medium">{name}</TableCell>
                      <TableCell><StatusBadge status={st as "critical" | "attention" | "healthy"}>{label}</StatusBadge></TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{score}</TableCell>
                      <TableCell className="hidden pr-0 text-right tabular-nums text-muted-foreground sm:table-cell">{life}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <section id="problem" className={section}>
          <h2 className={h2}>{t("land.problem.title")}</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {problems.map((n) => (
              <div key={n} className="flex flex-col gap-2">
                <h3 className="text-base font-medium">{t(`land.problem.${n}.t` as Key)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{t(`land.problem.${n}.b` as Key)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className={section}>
          <h2 className={h2}>{t("land.how.title")}</h2>
          <ol className="mt-8 flex flex-col">
            {steps.map((n, i) => (
              <li key={n}>
                {i > 0 && <Separator />}
                <div className="grid gap-x-8 gap-y-1 py-5 md:grid-cols-[3rem_16rem_1fr]">
                  <span className="text-sm text-muted-foreground tabular-nums">{String(n).padStart(2, "0")}</span>
                  <h3 className="text-base font-medium">{t(`land.how.${n}.t` as Key)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t(`land.how.${n}.b` as Key)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="roles" className={section}>
          <h2 className={h2}>{t("land.roles.title")}</h2>
          <ul className="mt-8 flex flex-col">
            {roles.map((r, i) => (
              <li key={r}>
                {i > 0 && <Separator />}
                <div className="grid gap-x-8 gap-y-1 py-5 md:grid-cols-[16rem_1fr]">
                  <h3 className="text-base font-medium">{t(`land.roles.${r}.t` as Key)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t(`land.roles.${r}.b` as Key)}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">{t("land.roles.note")}</p>
        </section>

        <section className={section}>
          <h2 className={h2}>{t("land.real.title")}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {(["real", "sim"] as const).map((k) => (
              <Card key={k}>
                <CardHeader><CardTitle>{t(`land.real.${k}.t` as Key)}</CardTitle></CardHeader>
                <CardContent>
                  <ul className="flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed text-muted-foreground">
                    {(k === "real" ? [1, 2, 3, 4] : [1, 2, 3]).map((n) => <li key={n}>{t(`land.real.${k}.${n}` as Key)}</li>)}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="evidence" className={section}>
          <h2 className={h2}>{t("land.evidence.title")}</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {(["a", "b"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <span className="text-5xl font-semibold tracking-tight tabular-nums">{t(`land.evidence.${k}` as Key)}</span>
                <span className="text-sm text-muted-foreground">{t(`land.evidence.${k}.l` as Key)}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("land.evidence.note")}</p>
        </section>

        <section className={section}>
          <h2 className={h2}>{t("land.amd.title")}</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{t("land.amd.body")}</p>
          <p className="mt-8 text-xs text-muted-foreground">{t("land.stack.title")}</p>
          <p className="mt-1 text-sm">{STACK.join("  ·  ")}</p>
        </section>

        <section id="team" className={`${section} pb-20`}>
          <h2 className={h2}>{t("land.team.title")}</h2>
          <p className="mt-4 text-base">{TEAM_NAME}</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("land.team.body")}</p>
          {TEAM_MEMBERS.length > 0 && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {TEAM_MEMBERS.map((m) => {
                const links = [m.website, m.linkedin, m.github].filter(Boolean).map((href) => [href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href]);
                const initials = m.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
                return (
                  <li key={m.name}>
                    <Card className="h-full">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar>
                          <CardTitle>{m.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {links.length > 0 ? (
                          <ul className="flex flex-col gap-2 text-sm">
                            {links.map(([label, href]) => (
                              <li key={href}>
                                <a href={href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
                                  <LinkIcon href={href} className="size-4 shrink-0" />
                                  <span className="min-w-0 flex-1 break-all underline-offset-4 group-hover:underline">{label}</span>
                                  <ExternalLink className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">{t("land.team.soon")}</p>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground">
          <span>{t("land.footer")}</span>
          <span className="flex gap-4">
            {REPO_URL && <a href={REPO_URL} className="hover:text-foreground">Source</a>}
            <Link href={signedIn ? "/app" : "/login"} className="hover:text-foreground">{signedIn ? t("land.openApp") : t("land.signIn")}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
