import { signOut } from "@/app/login/actions";

export default function NoLayout({ name, warehouses, reason }: { name: string; warehouses: string[]; reason: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-ui border border-rule bg-surface p-5">
        <h1 className="text-base font-semibold">Gudang belum bisa ditampilkan</h1>
        <p className="mt-2 text-sm text-ink/70">
          Halo {name}. {reason}{warehouses.length > 0 && ` (${warehouses.join(", ")})`}
        </p>
        <form action={signOut} className="mt-4">
          <button className="h-8 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5">Keluar</button>
        </form>
      </div>
    </main>
  );
}
