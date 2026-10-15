"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { makeT, type Lang } from "@/lib/i18n";
import { signUp, type LoginState } from "../actions";

export default function RegisterForm({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const [state, action, pending] = useActionState<LoginState, FormData>(signUp, undefined);
  return (
    <Card>
      <CardContent>
        <form action={action}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">{t("login.name")}</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{t("login.email")}</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("login.password")}</FieldLabel>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            {state?.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? t("login.registering") : t("login.register")}
            </Button>
          </FieldGroup>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("login.haveAccount")}{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">{t("login.submit")}</Link>
        </p>
      </CardContent>
    </Card>
  );
}
