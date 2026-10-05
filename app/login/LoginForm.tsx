"use client";

import { useActionState, useState, useTransition } from "react";
import { demoSignIn, signIn, type LoginState } from "./actions";

const DEMO_ROLES = [
  { role: "admin", label: "Admin perusahaan", note: "Semua gudang, pengguna, dan konfigurasi" },
  { role: "manager", label: "Manajer gudang", note: "Kelola aset dan perawatan di gudangnya" },
  { role: "technician", label: "Teknisi", note: "Jadwal, perbaikan, dan jurnal mesin" },
  { role: "viewer", label: "Pemantau", note: "Hanya lihat, tanpa mengubah data" },
];

export default function LoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, undefined);
  const [demoError, setDemoError] = useState<string>();
  const [demoPending, startDemo] = useTransition();

  return (
    <div className="mt-8">
      <form action={action} className="space-y-3 rounded-ui border border-rule bg-surface p-4">
        <label className="block text-xs text-ink/60">
          Email
          <input name="email" type="email" autoComplete="email" required className="mt-1 h-9 w-full rounded-ui border border-rule bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent" />
        </label>
        <label className="block text-xs text-ink/60">
          Kata sandi
          <input name="password" type="password" autoComplete="current-password" required className="mt-1 h-9 w-full rounded-ui border border-rule bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent" />
        </label>
        {state?.error && <p role="alert" className="text-xs text-bad">{state.error}</p>}
        <button disabled={pending} className="h-9 w-full rounded-ui bg-accent text-sm font-semibold text-canvas transition-opacity duration-150 hover:opacity-90 disabled:opacity-50">
          {pending ? "Masuk…" : "Masuk"}
        </button>
      </form>

      {demoEnabled && (
        <section className="mt-6" aria-labelledby="demo-title">
          <h2 id="demo-title" className="text-xs font-semibold text-ink/70">Akun demo untuk juri</h2>
          <p className="mt-1 text-xs text-ink/55">Data fiktif. Pilih peran untuk melihat perbedaan hak aksesnya.</p>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {DEMO_ROLES.map((d) => (
              <li key={d.role}>
                <button
                  disabled={demoPending}
                  onClick={() => startDemo(async () => { const r = await demoSignIn(d.role); if (r?.error) setDemoError(r.error); })}
                  className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition-colors duration-150 hover:bg-ink/5 disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-medium">{d.label}</span>
                    <span className="block text-xs text-ink/55">{d.note}</span>
                  </span>
                  <span className="text-xs text-accent">Masuk</span>
                </button>
              </li>
            ))}
          </ul>
          {demoError && <p role="alert" className="mt-2 text-xs text-bad">{demoError}</p>}
        </section>
      )}
    </div>
  );
}
