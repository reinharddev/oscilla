import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthUser { id: string; email: string }

/**
 * Who is calling, from the signed session token. Verified locally against the project's signing
 * keys, so it costs no request to the auth server (getUser() does). Database access is still
 * decided by row-level security, which uses the same token.
 */
export async function getAuthUser(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email ?? "" };
}
