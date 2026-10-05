import { signOut } from "@/app/login/actions";

export default function NoLayout({ name, warehouses }: { name: string; warehouses: string[] }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-ui border border-rule bg-surface p-5">
        <h1 className="text-base font-semibold">Layout gudang belum tersedia</h1>
        <p className="mt-2 text-sm text-ink/70">
          Halo {name}. Akunmu memiliki akses ke {warehouses.length ? warehouses.join(", ") : "gudang"}, tetapi tampilan 3D
          untuk gudang itu belum dikonfigurasi di versi ini. Daftar aset dan jurnalnya sudah tersimpan di database.
        </p>
        <form action={signOut} className="mt-4">
          <button className="h-8 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5">Keluar</button>
        </form>
      </div>
    </main>
  );
}
