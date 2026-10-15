import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Key, Lang } from "@/lib/i18n";
import { makeT } from "@/lib/i18n";

export default function NoLayout({ name, warehouses, reason, lang }: { name: string; warehouses: string[]; reason: Key; lang: Lang }) {
  const t = makeT(lang);
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("nolayout.title")}</CardTitle>
          <CardDescription>{t("nolayout.hello", { name, reason: t(reason) })}{warehouses.length > 0 && ` (${warehouses.join(", ")})`}</CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter>
          <form action={signOut}><Button variant="outline" type="submit">{t("common.signOut")}</Button></form>
        </CardFooter>
      </Card>
    </main>
  );
}
