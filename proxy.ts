import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // /api/ingest authenticates gateways with its own key, not with a browser session; /api/ping is a public probe.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/ingest|api/ping|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
