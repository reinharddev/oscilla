"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

const DEMO_EMAILS: Record<string, string> = {
  admin: "admin@oscilla.example",
  manager: "manager@oscilla.example",
  technician: "technician@oscilla.example",
  viewer: "viewer@oscilla.example",
};

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Isi email dan kata sandi." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email atau kata sandi salah." };
  redirect("/");
}

/** One-click sign-in for the demo accounts. The shared password lives only in the server env. */
export async function demoSignIn(role: string): Promise<LoginState> {
  const email = DEMO_EMAILS[role];
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) return { error: "Akun demo tidak tersedia di lingkungan ini." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Akun demo gagal masuk." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
