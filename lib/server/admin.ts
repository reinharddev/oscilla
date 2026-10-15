import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Service-role client. Server only: it bypasses row-level security, so callers must authorise first. */
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const simEnabled = () => (process.env.SIM_ENABLED ?? "true") !== "false";
