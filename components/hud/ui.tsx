export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold text-ink/70">{title}</h2>
        {aside && <span className="text-xs text-ink/45">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Bar({ value, warn }: { value: number; warn?: boolean }) {
  return (
    <div className="h-1 bg-ink/10">
      <div className={`h-full transition-[width] duration-300 ${warn ? "bg-warn" : "bg-accent"}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}
