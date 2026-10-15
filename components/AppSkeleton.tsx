import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** What the app looks like before its data arrives: the same shell, with grey blocks where content goes. */
export function AppSkeleton() {
  return (
    <main className="flex h-dvh w-screen flex-col bg-background" aria-busy="true" aria-live="polite">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        <span className="text-sm font-semibold tracking-tight">Oscilla</span>
        <Skeleton className="hidden h-7 w-44 sm:block" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="size-7" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="size-7 rounded-full" />
        </div>
      </header>
      <div className="flex h-10 shrink-0 items-center gap-6 border-b bg-card px-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <Skeleton className="h-6 w-40" />
            <div className="flex gap-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-28" /><Skeleton className="h-5 w-20" /></div>
          </div>
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
                <div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div>
                <Skeleton className="hidden h-4 w-16 sm:block" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-8" />
              </div>
            ))}
          </div>
        </section>
        <aside className="hidden w-[420px] shrink-0 flex-col gap-4 border-l bg-card p-4 lg:flex">
          <Card size="sm">
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="flex flex-col gap-2"><Skeleton className="h-8 w-36" /><Skeleton className="h-4 w-full" /></CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
