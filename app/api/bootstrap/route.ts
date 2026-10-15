import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { loadBootstrap } from "@/lib/server/bootstrap";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First load and warehouse switch of the single-page app. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const w = new URL(request.url).searchParams.get("warehouse");
  const out = await loadBootstrap(supabase, user, await getLang(), w && UUID.test(w) ? w : undefined);
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
