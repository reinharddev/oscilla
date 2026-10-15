"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { makeT, type Key, type Lang } from "@/lib/i18n";
import { demoSignIn, signIn, type LoginState } from "./actions";

const DEMO_ROLES = ["admin", "manager", "technician", "viewer"] as const;

export default function LoginForm({ demoEnabled, lang }: { demoEnabled: boolean; lang: Lang }) {
  const t = makeT(lang);
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, undefined);
  const [demoError, setDemoError] = useState<string>();
  const [demoPending, startDemo] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">{t("login.email")}</FieldLabel>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">{t("login.password")}</FieldLabel>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </Field>
              {state?.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? t("login.submitting") : t("login.submit")}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {demoEnabled && (
        <Card size="sm" aria-labelledby="demo-title">
          <CardHeader>
            <CardTitle id="demo-title">{t("login.demoTitle")}</CardTitle>
            <CardDescription>{t("login.demoNote")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col">
              {DEMO_ROLES.map((role, i) => (
                <li key={role}>
                  {i > 0 && <Separator />}
                  <Button
                    variant="ghost"
                    disabled={demoPending}
                    onClick={() => startDemo(async () => { const r = await demoSignIn(role); if (r?.error) setDemoError(r.error); })}
                    className="h-auto w-full justify-between gap-3 rounded-none px-1 py-2.5 text-left font-normal"
                  >
                    <span className="flex flex-col items-start">
                      <span className="text-sm font-medium">{t(`login.role.${role}` as Key)}</span>
                      <span className="text-xs text-muted-foreground">{t(`login.role.${role}.note` as Key)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t("login.demoEnter")}</span>
                  </Button>
                </li>
              ))}
            </ul>
            {demoError && <Alert variant="destructive" className="mt-3"><AlertDescription>{demoError}</AlertDescription></Alert>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
