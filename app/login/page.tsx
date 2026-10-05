import LoginForm from "./LoginForm";

export default function LoginPage() {
  const demoEnabled = Boolean(process.env.DEMO_PASSWORD);
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Oscilla</h1>
        <p className="mt-1 text-sm text-ink/60">
          Pemantauan kesehatan robot gudang. Hanya untuk staf perusahaan.
        </p>
        <LoginForm demoEnabled={demoEnabled} />
      </div>
    </main>
  );
}
