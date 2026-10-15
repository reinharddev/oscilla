"use server";

import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { adminClient } from "@/lib/server/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

const DEMO_EMAILS: Record<string, string> = {
  admin: "admin@oscilla.example",
  manager: "manager@oscilla.example",
  technician: "technician@oscilla.example",
  viewer: "viewer@oscilla.example",
};

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { t } = await getT();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: t("login.errFill") };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: t("login.errBad") };
  redirect("/app");
}

/** One-click sign-in for the demo accounts. The shared password lives only in the server env. */
export async function demoSignIn(role: string): Promise<LoginState> {
  const { t } = await getT();
  const email = DEMO_EMAILS[role];
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) return { error: t("login.errDemoUnavailable") };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: t("login.errDemoFail") };
  redirect("/app");
}

// Demo organisation from scripts/seed-demo-users.mjs. New sign-ups join it read-only.
const DEMO_ORG = "a0000000-0000-4000-8000-000000000001";
const DEMO_WAREHOUSE = "b0000000-0000-4000-8000-000000000001";

/** Self-service registration. In demo mode the new account joins the demo warehouse as a viewer; an admin can promote it. */
export async function signUp(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { t } = await getT();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || !password) return { error: t("login.errFill") };
  if (password.length < 8) return { error: t("login.errShort") };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  if (error || !data.user) return { error: error?.message ?? t("login.errRegister") };
  // Supabase returns an obfuscated user with no identities when the email is already taken.
  if (data.user.identities?.length === 0) return { error: t("login.errTaken") };

  const admin = process.env.DEMO_PASSWORD ? adminClient() : null;
  if (admin) {
    await admin.from("profiles").upsert({ id: data.user.id, org_id: DEMO_ORG, full_name: name });
    await admin.from("memberships").insert({ user_id: data.user.id, org_id: DEMO_ORG, warehouse_id: DEMO_WAREHOUSE, role: "viewer" });
  }
  if (!data.session) {
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    if (e2) return { error: t("login.errConfirm") };
  }
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
