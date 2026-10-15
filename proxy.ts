import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // /api/ingest authenticates gateways with its own key, not with a browser session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/ingest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
