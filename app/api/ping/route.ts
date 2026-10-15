import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for an uptime monitor. Public and read-only: it touches the database and the
 * health service so neither goes idle, and returns only whether each answered.
 */
export async function GET() {
  const admin = adminClient();
  const [db, health] = await Promise.all([
    admin
      ? admin.from("organizations").select("id").limit(1).then((r) => !r.error, () => false)
      : Promise.resolve(false),
    (async () => {
      const base = process.env.HEALTH_SERVICE_URL;
      if (!base) return false;
      try {
        const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        return res.ok;
      } catch {
        return false;
      }
    })(),
  ]);
  return NextResponse.json({ ok: db && health, database: db, healthService: health, at: new Date().toISOString() }, { status: db ? 200 : 503, headers: { "cache-control": "no-store" } });
}
